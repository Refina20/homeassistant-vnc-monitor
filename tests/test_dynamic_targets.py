import base64
import importlib.util
import json
import pathlib
import sys
import types
import unittest


class BasePlugin:
    def __init__(self, source):
        self.source = source


websockify = types.ModuleType("websockify")
token_plugins = types.ModuleType("websockify.token_plugins")
token_plugins.BasePlugin = BasePlugin
sys.modules["websockify"] = websockify
sys.modules["websockify.token_plugins"] = token_plugins

MODULE_PATH = pathlib.Path(__file__).parents[1] / "vnc-viewer" / "root" / "opt" / "vnc-viewer" / "dynamic_targets.py"
SPEC = importlib.util.spec_from_file_location("dynamic_targets", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def token(payload):
    raw = json.dumps(payload).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


class DynamicTargetsTest(unittest.TestCase):
    def setUp(self):
        self.plugin = MODULE.DynamicTargets("unused")

    def test_resolves_hostname_and_port(self):
        self.assertEqual(self.plugin.lookup(token({"host": "camera.local", "port": 5901})), ("camera.local", 5901))

    def test_supports_ipv4_and_ipv6(self):
        self.assertEqual(self.plugin.lookup(token({"host": "192.168.1.20", "port": 5900})), ("192.168.1.20", 5900))
        self.assertEqual(self.plugin.lookup(token({"host": "fd00::20", "port": 5900})), ("fd00::20", 5900))

    def test_defaults_to_vnc_port(self):
        self.assertEqual(self.plugin.lookup(token({"host": "server"})), ("server", 5900))

    def test_rejects_invalid_tokens_hosts_and_ports(self):
        invalid = [
            "not-base64!",
            token({}),
            token({"host": "host/name", "port": 5900}),
            token({"host": "server", "port": 0}),
            token({"host": "server", "port": 65536}),
            "a" * (MODULE.MAX_TOKEN_BYTES + 1),
        ]
        for value in invalid:
            with self.subTest(value=value[:30]):
                self.assertIsNone(self.plugin.lookup(value))


if __name__ == "__main__":
    unittest.main()
