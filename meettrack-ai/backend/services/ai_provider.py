"""
Talks to the configured LLM provider. The API key lives only on the server (environment variable).

Supported providers (set AI_PROVIDER in backend/.env):
  openai     any OpenAI-compatible chat-completions API (OpenAI, Google Gemini's OpenAI endpoint,
             Groq, OpenRouter, ...). Uses JSON mode (response_format=json_object).
  anthropic  Anthropic Messages API.
"""
import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

SUPPORTED_PROVIDERS = ("openai", "anthropic")


class AIProviderError(Exception):
    """A problem talking to the AI provider. `code` and `retryable` are shown to the user."""

    def __init__(self, code, message, http_status=502, retryable=True):
        super().__init__(message)
        self.code = code
        self.message = message
        self.http_status = http_status
        self.retryable = retryable


def is_configured():
    return bool(
        settings.AI_PROVIDER in SUPPORTED_PROVIDERS and settings.AI_API_KEY and settings.AI_MODEL
    )


def call_llm(system_prompt, user_prompt):
    """Send one request and return the model's raw text. Raises AIProviderError on any failure."""
    if not is_configured():
        raise AIProviderError(
            "ai_not_configured",
            "The AI provider is not configured. Set AI_PROVIDER, AI_API_KEY and AI_MODEL in backend/.env "
            "and restart the backend.",
            http_status=503,
            retryable=False,
        )
    try:
        if settings.AI_PROVIDER == "anthropic":
            response = _call_anthropic(system_prompt, user_prompt)
        else:
            response = _call_openai_compatible(system_prompt, user_prompt)
    except requests.Timeout:
        raise AIProviderError(
            "ai_timeout", "The AI provider took too long to respond. Please retry.", http_status=504
        )
    except requests.ConnectionError:
        raise AIProviderError(
            "ai_unreachable", "Could not reach the AI provider. Check your internet connection and AI_BASE_URL.",
            http_status=502,
        )
    except requests.RequestException:
        raise AIProviderError("ai_provider_error", "The AI request failed. Please retry.", http_status=502)

    _raise_for_status(response)
    try:
        data = response.json()
        if settings.AI_PROVIDER == "anthropic":
            text = "".join(block.get("text", "") for block in data["content"] if block.get("type") == "text")
        else:
            text = data["choices"][0]["message"]["content"]
    except (ValueError, KeyError, IndexError, TypeError):
        raise AIProviderError("ai_bad_response", "The AI provider returned an unexpected response. Please retry.")
    if not text or not text.strip():
        raise AIProviderError("ai_empty_response", "The AI provider returned an empty response. Please retry.")
    return text


def _timeout():
    return (10, settings.AI_TIMEOUT_SECONDS)  # (connect, read)


def _call_openai_compatible(system_prompt, user_prompt):
    url = settings.AI_BASE_URL.rstrip("/") + "/chat/completions"
    return requests.post(
        url,
        headers={"Authorization": f"Bearer {settings.AI_API_KEY}", "Content-Type": "application/json"},
        json={
            "model": settings.AI_MODEL,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0,
        },
        timeout=_timeout(),
    )


def _call_anthropic(system_prompt, user_prompt):
    base = settings.AI_BASE_URL if "anthropic" in settings.AI_BASE_URL else "https://api.anthropic.com/v1"
    return requests.post(
        base.rstrip("/") + "/messages",
        headers={
            "x-api-key": settings.AI_API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json={
            "model": settings.AI_MODEL,
            "max_tokens": 8000,
            "temperature": 0,
            "system": system_prompt,
            "messages": [{"role": "user", "content": user_prompt}],
        },
        timeout=_timeout(),
    )


def _raise_for_status(response):
    code = response.status_code
    if code < 400:
        return
    logger.warning("AI provider returned HTTP %s", code)  # body is not logged: it may echo meeting text
    if code in (401, 403):
        raise AIProviderError(
            "ai_auth_failed", "The AI provider rejected the API key. Check AI_API_KEY in backend/.env.",
            http_status=502, retryable=False,
        )
    if code == 429:
        raise AIProviderError(
            "ai_rate_limited", "The AI provider is rate limiting requests. Wait a minute and retry.",
            http_status=429,
        )
    if code == 404:
        raise AIProviderError(
            "ai_model_not_found", "The AI model or endpoint was not found. Check AI_MODEL and AI_BASE_URL.",
            http_status=502, retryable=False,
        )
    if code >= 500:
        raise AIProviderError("ai_provider_error", "The AI provider had a temporary problem. Please retry.")
    raise AIProviderError(
        "ai_request_rejected", f"The AI provider rejected the request (HTTP {code}). Check AI_MODEL and AI_BASE_URL.",
        http_status=502, retryable=False,
    )
