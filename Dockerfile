FROM python:3.9-slim

ENV TZ=America/Sao_Paulo
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

WORKDIR /app

# Instalar dependências
RUN pip install mcstatus psutil

COPY . .

EXPOSE 3010

CMD ["python", "server.py"]

