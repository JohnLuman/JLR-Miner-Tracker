FROM node:22-bookworm-slim AS node_runtime

FROM continuumio/miniconda3:latest

SHELL ["/bin/bash", "-lc"]

RUN apt-get update && apt-get install -y --no-install-recommends \
    git wget curl ca-certificates ffmpeg build-essential libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=node_runtime /usr/local/ /usr/local/

RUN conda create -y -n gptsovits python=3.10 pip \
    && conda clean -afy

WORKDIR /opt/GPT-SoVITS
RUN git init \
    && git remote add origin https://github.com/RVC-Boss/GPT-SoVITS.git \
    && git fetch --depth 1 origin 48b1a0169a28582a8984402f82cf438d3bfa6aca \
    && git checkout --detach FETCH_HEAD

# GPT-SoVITS' installer uses tput only to prettify wget progress; Railway builds are headless.
RUN sed -i 's/tput cuu1 && tput el/true/g' install.sh \
    && /opt/conda/bin/conda run -n gptsovits bash install.sh --device CPU --source HF

# requirements.txt can replace CPU torchaudio with a CUDA-linked PyPI wheel.
# Reinstall torchaudio from PyTorch's CPU index and prove imports work at build time.
RUN /opt/conda/bin/conda run -n gptsovits python -m pip uninstall -y torchaudio \
    && /opt/conda/bin/conda run -n gptsovits python -m pip install --no-cache-dir torchaudio --index-url https://download.pytorch.org/whl/cpu \
    && /opt/conda/bin/conda run -n gptsovits python -c "import torch, torchaudio; print('CPU voice runtime', torch.__version__, torchaudio.__version__, 'cuda=', torch.cuda.is_available())"

WORKDIR /app
COPY package.json ./
COPY core.mjs server.mjs start.sh tts-cpu.yaml ./
RUN chmod +x /app/start.sh && mkdir -p /app/data /data/voice

ENV PORT=8080
ENV PYTHONUNBUFFERED=1
ENV PATH="/opt/conda/envs/gptsovits/bin:/opt/conda/bin:/usr/local/bin:/usr/bin:/bin"

EXPOSE 8080
CMD ["/app/start.sh"]
