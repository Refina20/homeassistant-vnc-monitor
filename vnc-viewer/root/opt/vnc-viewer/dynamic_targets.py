"""Dynamic, validation-only websockify token resolver.

The browser encodes the requested VNC host and port in a URL-safe base64 token.
This keeps connection targets out of the add-on configuration and lets a single
websockify process serve several simultaneous noVNC clients.
"""

import base64
import json
import re

from websockify.token_plugins import BasePlugin


MAX_TOKEN_BYTES = 2048
HOST_RE = re.compile(r"^[A-Za-z0-9_.:-]+$")


class DynamicTargets(BasePlugin):
    """Resolve a base64url JSON token to a validated ``(host, port)`` tuple."""

    def lookup(self, token):
        if not token or len(token) > MAX_TOKEN_BYTES:
            return None

        try:
            padded = token + "=" * (-len(token) % 4)
            payload = base64.urlsafe_b64decode(padded.encode("ascii"))
            target = json.loads(payload.decode("utf-8"))
            host = target["host"].strip()
            port = int(target.get("port", 5900))
        except (KeyError, TypeError, ValueError, UnicodeError, json.JSONDecodeError):
            return None

        if (
            not host
            or len(host) > 253
            or not HOST_RE.fullmatch(host)
            or host.startswith(":")
            or host.endswith(":")
            or not 1 <= port <= 65535
        ):
            return None

        return host, port
