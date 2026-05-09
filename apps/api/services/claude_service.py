import anthropic
from typing import AsyncGenerator

MODEL = "claude-sonnet-4-20250514"

async def stream_claude(api_key: str, system: str, user: str) -> AsyncGenerator[dict, None]:
    client = anthropic.Anthropic(api_key=api_key)
    total_tokens = 0
    try:
        with client.messages.stream(
            model=MODEL,
            max_tokens=4096,
            system=system,
            messages=[{"role": "user", "content": user}],
        ) as stream:
            for text in stream.text_stream:
                yield {"type": "chunk", "content": text, "tokens": total_tokens}
            final = stream.get_final_message()
            total_tokens = final.usage.input_tokens + final.usage.output_tokens
            yield {"type": "done", "tokens": total_tokens}
    except anthropic.AuthenticationError:
        yield {"type": "error", "message": "Invalid API key"}
    except anthropic.RateLimitError:
        yield {"type": "error", "message": "Rate limit exceeded"}
    except Exception as e:
        yield {"type": "error", "message": str(e)}

async def call_claude_once(api_key: str, system: str, user: str) -> dict:
    client = anthropic.Anthropic(api_key=api_key)
    message = client.messages.create(
        model=MODEL,
        max_tokens=8096,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    content = "".join(b.text for b in message.content if hasattr(b, "text"))
    tokens = message.usage.input_tokens + message.usage.output_tokens
    return {"content": content, "tokens": tokens, "model": MODEL}
