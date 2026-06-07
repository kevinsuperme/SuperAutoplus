FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt /app/requirements.txt
COPY src/customer_portal_api/requirements.txt /app/src/customer_portal_api/requirements.txt
RUN pip install -r /app/src/customer_portal_api/requirements.txt

COPY . /app
ENV PYTHONPATH=/app/src

EXPOSE 8100

CMD ["python", "-m", "uvicorn", "customer_portal_api.main:app", "--host", "0.0.0.0", "--port", "8100"]
