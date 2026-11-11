"""Minimal provider-independent AI gateway (first step toward ADR 0002's LLM Gateway).

Features ask the gateway for structured JSON; they never import a provider SDK. Gemini is the
only provider today. Adding another provider means implementing `AIProvider.generate_json`.

Safety rules enforced here:
- The API key comes only from settings (environment), is held as a SecretStr and is never
  logged, returned or included in exception messages.
- Provider failures are mapped to a small set of gateway errors with generic messages, so raw
  SDK errors (which can echo request details) never reach HTTP responses.
- Callers are responsible for not putting personal data in prompts (see ai_question_service).
"""
import asyncio
import logging
from typing import Protocol, Type

from pydantic import BaseModel

from backend.app.core.config import settings

logger = logging.getLogger("lumeneios.ai_gateway")


class AIGatewayError(Exception):
    """Base class. `public_message` is safe to show to an educator."""

    public_message = "The AI service could not complete the request."


class AINotConfigured(AIGatewayError):
    public_message = "AI question generation is not configured on this server (GEMINI_API_KEY is not set)."


class AIProviderTimeout(AIGatewayError):
    public_message = "The AI service took too long to respond. Try again, or request fewer questions."


class AIProviderError(AIGatewayError):
    public_message = "The AI service returned an error. Try again in a moment."


class AIInvalidResponse(AIGatewayError):
    public_message = "The AI response could not be understood. Try generating again."


class AIProvider(Protocol):
    name: str
    model: str

    async def generate_json(self, *, system: str, prompt: str, schema: Type[BaseModel]) -> str:
        """Return the raw JSON text the model produced for `schema`."""


class GeminiProvider:
    """Google Gemini through the official `google-genai` SDK, using structured JSON output."""

    name = "gemini"

    def __init__(self, api_key: str, model: str, timeout_seconds: float, client=None):
        if not api_key:
            raise AINotConfigured()
        self.model = model
        self._timeout = timeout_seconds
        if client is None:
            from google import genai
            from google.genai import types
            client = genai.Client(api_key=api_key, http_options=types.HttpOptions(timeout=int(timeout_seconds * 1000)))
        self._client = client

    async def generate_json(self, *, system: str, prompt: str, schema: Type[BaseModel]) -> str:
        from google.genai import errors, types

        config = types.GenerateContentConfig(
            system_instruction=system,
            response_mime_type="application/json",
            response_schema=schema,
            temperature=0.7,
        )
        try:
            response = await asyncio.wait_for(
                self._client.aio.models.generate_content(model=self.model, contents=prompt, config=config),
                timeout=self._timeout,
            )
        except asyncio.TimeoutError:
            logger.warning("Gemini request timed out (model=%s).", self.model)
            raise AIProviderTimeout() from None
        except errors.APIError as exc:
            # Log only the status code; messages can contain request details.
            logger.warning("Gemini API error (model=%s, code=%s).", self.model, getattr(exc, "code", "?"))
            raise AIProviderError() from None
        except Exception as exc:  # network/transport errors from the SDK
            logger.warning("Gemini request failed (model=%s, %s).", self.model, type(exc).__name__)
            raise AIProviderError() from None
        text = getattr(response, "text", None)
        if not text:
            logger.warning("Gemini returned no text (model=%s).", self.model)
            raise AIInvalidResponse()
        return text


def get_ai_provider() -> AIProvider:
    """Build the configured provider. Raises AINotConfigured if no key is set.
    Tests replace this function; they never reach a real provider."""
    return GeminiProvider(
        api_key=settings.GEMINI_API_KEY.get_secret_value().strip(),
        model=settings.GEMINI_MODEL,
        timeout_seconds=settings.AI_REQUEST_TIMEOUT_SECONDS,
    )
