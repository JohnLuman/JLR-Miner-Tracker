#!/usr/bin/env python3
"""Build JLR's compact local EVE static-data catalog from CCP's official SDE.

Only the tables Appraisal/Support need are imported. The finished SQLite file is
atomically replaced so readers never see a half-built catalog.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import shutil
import sqlite3
import tempfile
import urllib.request
import zipfile

LATEST_URL = "https://developers.eveonline.com/static-data/tranquility/latest.jsonl"
BUILD_URL = (
    "https://developers.eveonline.com/static-data/tranquility/"
    "eve-online-static-data-{build}-jsonl.zip"
)
USER_AGENT = "JLR-Miner-Tracker-SDE/1.0"
WANTED = {
    "_sde.jsonl",
    "types.jsonl",
    "compressibleTypes.jsonl",
    "typeMaterials.jsonl",
    "groups.jsonl",
    "categories.jsonl",
    "marketGroups.jsonl",
}


def http_bytes(url: str, timeout: int = 90) -> bytes:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/json,application/octet-stream,*/*",
        },
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def latest_build() -> tuple[int, str | None]:
    raw = http_bytes(LATEST_URL, timeout=30).decode("utf-8", "replace")
    build = 0
    release = None
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        row = json.loads(line)
        if row.get("_key") == "sde":
            build = int(row.get("buildNumber") or row.get("build") or 0)
            release = row.get("releaseDate")
            break
    if build <= 0:
        raise RuntimeError("CCP latest.jsonl did not contain an SDE build number")
    return build, release


def existing_build(db_path: str) -> int:
    if not os.path.isfile(db_path) or os.path.getsize(db_path) < 4096:
        return 0
    try:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        try:
            row = conn.execute(
                "SELECT value FROM meta WHERE key='build_number'"
            ).fetchone()
            return int(row[0]) if row else 0
        finally:
            conn.close()
    except Exception:
        return 0


def english(value) -> str:
    if isinstance(value, dict):
        return str(value.get("en") or next(iter(value.values()), "") or "").strip()
    return str(value or "").strip()


def iter_jsonl(zf: zipfile.ZipFile, member: str):
    with zf.open(member, "r") as handle:
        for raw in handle:
            if not raw.strip():
                continue
            yield json.loads(raw)


def find_members(zf: zipfile.ZipFile) -> dict[str, str]:
    found: dict[str, str] = {}
    for name in zf.namelist():
        base = os.path.basename(name)
        if base in WANTED:
            found[base] = name
    required = {"types.jsonl", "compressibleTypes.jsonl", "typeMaterials.jsonl"}
    missing = required - set(found)
    if missing:
        raise RuntimeError("SDE archive missing required files: " + ", ".join(sorted(missing)))
    return found


def create_schema(conn: sqlite3.Connection):
    conn.executescript(
        """
        PRAGMA journal_mode=OFF;
        PRAGMA synchronous=OFF;
        PRAGMA temp_store=MEMORY;
        PRAGMA foreign_keys=OFF;

        CREATE TABLE meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE TABLE types (
          type_id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          name_key TEXT NOT NULL,
          group_id INTEGER,
          market_group_id INTEGER,
          volume REAL NOT NULL DEFAULT 0,
          packaged_volume REAL NOT NULL DEFAULT 0,
          portion_size INTEGER NOT NULL DEFAULT 1,
          published INTEGER NOT NULL DEFAULT 0,
          base_price REAL
        );
        CREATE INDEX idx_types_name_key ON types(name_key);
        CREATE INDEX idx_types_group ON types(group_id);
        CREATE INDEX idx_types_market_group ON types(market_group_id);

        CREATE TABLE compression (
          raw_type_id INTEGER PRIMARY KEY,
          compressed_type_id INTEGER NOT NULL
        );
        CREATE INDEX idx_compression_compressed ON compression(compressed_type_id);

        CREATE TABLE materials (
          type_id INTEGER NOT NULL,
          material_type_id INTEGER NOT NULL,
          quantity INTEGER NOT NULL,
          PRIMARY KEY(type_id, material_type_id)
        );
        CREATE INDEX idx_materials_material ON materials(material_type_id);

        CREATE TABLE groups (
          group_id INTEGER PRIMARY KEY,
          category_id INTEGER,
          name TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE categories (
          category_id INTEGER PRIMARY KEY,
          name TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE market_groups (
          market_group_id INTEGER PRIMARY KEY,
          parent_group_id INTEGER,
          name TEXT NOT NULL DEFAULT ''
        );
        """
    )


def import_optional_keyed_table(
    conn: sqlite3.Connection,
    zf: zipfile.ZipFile,
    members: dict[str, str],
    file_name: str,
    sql: str,
    row_builder,
):
    member = members.get(file_name)
    if not member:
        return 0
    batch = []
    count = 0
    for row in iter_jsonl(zf, member):
        built = row_builder(row)
        if built is None:
            continue
        batch.append(built)
        if len(batch) >= 5000:
            conn.executemany(sql, batch)
            count += len(batch)
            batch.clear()
    if batch:
        conn.executemany(sql, batch)
        count += len(batch)
    return count


def build_database(zip_path: str, out_path: str, build: int, release: str | None):
    temp_db = out_path + ".building"
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    if os.path.exists(temp_db):
        os.unlink(temp_db)

    conn = sqlite3.connect(temp_db)
    try:
        create_schema(conn)
        with zipfile.ZipFile(zip_path, "r") as zf:
            members = find_members(zf)

            type_rows = []
            type_count = 0
            for row in iter_jsonl(zf, members["types.jsonl"]):
                type_id = int(row.get("_key") or 0)
                name = english(row.get("name"))
                if type_id <= 0 or not name:
                    continue
                volume = float(row.get("volume") or 0)
                packaged = float(row.get("packagedVolume") or volume or 0)
                type_rows.append(
                    (
                        type_id,
                        name,
                        name.casefold(),
                        int(row.get("groupID") or 0) or None,
                        int(row.get("marketGroupID") or 0) or None,
                        volume,
                        packaged,
                        max(1, int(row.get("portionSize") or 1)),
                        1 if row.get("published") else 0,
                        float(row["basePrice"]) if row.get("basePrice") is not None else None,
                    )
                )
                if len(type_rows) >= 5000:
                    conn.executemany(
                        """
                        INSERT INTO types(
                          type_id,name,name_key,group_id,market_group_id,volume,
                          packaged_volume,portion_size,published,base_price
                        ) VALUES(?,?,?,?,?,?,?,?,?,?)
                        """,
                        type_rows,
                    )
                    type_count += len(type_rows)
                    type_rows.clear()
            if type_rows:
                conn.executemany(
                    """
                    INSERT INTO types(
                      type_id,name,name_key,group_id,market_group_id,volume,
                      packaged_volume,portion_size,published,base_price
                    ) VALUES(?,?,?,?,?,?,?,?,?,?)
                    """,
                    type_rows,
                )
                type_count += len(type_rows)

            compression_count = import_optional_keyed_table(
                conn,
                zf,
                members,
                "compressibleTypes.jsonl",
                "INSERT OR REPLACE INTO compression(raw_type_id,compressed_type_id) VALUES(?,?)",
                lambda row: (
                    int(row.get("_key") or 0),
                    int(row.get("compressedTypeID") or 0),
                )
                if int(row.get("_key") or 0) > 0
                and int(row.get("compressedTypeID") or 0) > 0
                else None,
            )

            material_count = 0
            material_batch = []
            for row in iter_jsonl(zf, members["typeMaterials.jsonl"]):
                type_id = int(row.get("_key") or 0)
                if type_id <= 0:
                    continue
                for material in row.get("materials") or []:
                    material_id = int(material.get("materialTypeID") or 0)
                    quantity = int(material.get("quantity") or 0)
                    if material_id <= 0 or quantity <= 0:
                        continue
                    material_batch.append((type_id, material_id, quantity))
                    if len(material_batch) >= 10000:
                        conn.executemany(
                            "INSERT OR REPLACE INTO materials(type_id,material_type_id,quantity) VALUES(?,?,?)",
                            material_batch,
                        )
                        material_count += len(material_batch)
                        material_batch.clear()
            if material_batch:
                conn.executemany(
                    "INSERT OR REPLACE INTO materials(type_id,material_type_id,quantity) VALUES(?,?,?)",
                    material_batch,
                )
                material_count += len(material_batch)

            group_count = import_optional_keyed_table(
                conn,
                zf,
                members,
                "groups.jsonl",
                "INSERT OR REPLACE INTO groups(group_id,category_id,name) VALUES(?,?,?)",
                lambda row: (
                    int(row.get("_key") or 0),
                    int(row.get("categoryID") or 0) or None,
                    english(row.get("name")),
                )
                if int(row.get("_key") or 0) > 0
                else None,
            )
            category_count = import_optional_keyed_table(
                conn,
                zf,
                members,
                "categories.jsonl",
                "INSERT OR REPLACE INTO categories(category_id,name) VALUES(?,?)",
                lambda row: (
                    int(row.get("_key") or 0),
                    english(row.get("name")),
                )
                if int(row.get("_key") or 0) > 0
                else None,
            )
            market_group_count = import_optional_keyed_table(
                conn,
                zf,
                members,
                "marketGroups.jsonl",
                "INSERT OR REPLACE INTO market_groups(market_group_id,parent_group_id,name) VALUES(?,?,?)",
                lambda row: (
                    int(row.get("_key") or 0),
                    int(row.get("parentGroupID") or 0) or None,
                    english(row.get("name")),
                )
                if int(row.get("_key") or 0) > 0
                else None,
            )

        meta = {
            "build_number": str(build),
            "release_date": str(release or ""),
            "imported_at": dt.datetime.now(dt.timezone.utc).isoformat(),
            "source": "ccp-official-sde-jsonl",
            "type_count": str(type_count),
            "compression_count": str(compression_count),
            "material_count": str(material_count),
            "group_count": str(group_count),
            "category_count": str(category_count),
            "market_group_count": str(market_group_count),
        }
        conn.executemany("INSERT INTO meta(key,value) VALUES(?,?)", meta.items())
        conn.commit()
        conn.execute("ANALYZE")
        conn.commit()
    finally:
        conn.close()

    os.replace(temp_db, out_path)
    return {
        "buildNumber": build,
        "releaseDate": release,
        "database": out_path,
        "bytes": os.path.getsize(out_path),
        "typeCount": type_count,
        "compressionCount": compression_count,
        "materialCount": material_count,
        "groupCount": group_count,
        "categoryCount": category_count,
        "marketGroupCount": market_group_count,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", required=True)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    build, release = latest_build()
    current = existing_build(args.db)
    if current == build and not args.force:
        print(
            json.dumps(
                {
                    "ok": True,
                    "updated": False,
                    "buildNumber": build,
                    "releaseDate": release,
                    "database": args.db,
                    "bytes": os.path.getsize(args.db),
                }
            )
        )
        return

    with tempfile.TemporaryDirectory(prefix="jlr-sde-") as tmp:
        zip_path = os.path.join(tmp, f"sde-{build}.zip")
        with open(zip_path, "wb") as handle:
            handle.write(http_bytes(BUILD_URL.format(build=build), timeout=180))
        result = build_database(zip_path, args.db, build, release)
        result.update({"ok": True, "updated": True})
        print(json.dumps(result))


if __name__ == "__main__":
    main()
