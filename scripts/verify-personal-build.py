"""Read-only checks for the built personal Firefox artifact; no browser or API I/O."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
build = ROOT / "apps/extension/.output/firefox-mv2"
manifest = json.loads((build / "manifest.json").read_text())
assert manifest["name"] == "CartSplit"
gecko = manifest["browser_specific_settings"]["gecko"]
assert gecko["id"] == "cartsplit@mcgeeker"
assert set(gecko["data_collection_permissions"]["required"]) == {
    "authenticationInfo", "financialAndPaymentInfo"
}
assert set(manifest["permissions"]) == {
    "storage", "tabs", "https://www.amazon.ca/*", "https://api.ynab.com/*",
    "https://huggingface.co/*", "https://*.huggingface.co/*", "https://*.hf.co/*",
}
assert len(manifest["content_scripts"]) == 1
assert manifest["content_scripts"][0]["run_at"] == "document_start"
assert set(manifest["content_scripts"][0]["matches"]) == {
    "https://www.amazon.ca/your-orders/order-details*",
    "https://www.amazon.ca/cpe/yourpayments/transactions*",
}
csp = manifest["content_security_policy"]
if isinstance(csp, dict):
    csp = csp["extension_pages"]
policies = dict(part.strip().split(" ", 1) for part in csp.split(";") if part.strip())
assert policies["default-src"] == "'self'"
assert policies["script-src"] == "'self' 'wasm-unsafe-eval'"
assert policies["object-src"] == policies["base-uri"] == policies["form-action"] == "'none'"
assert set(policies["connect-src"].split()) == {
    "'self'", "https://api.ynab.com", "https://huggingface.co",
    "https://*.huggingface.co", "https://*.hf.co",
}
for name in ["ort-wasm-simd-threaded.jsep.mjs", "ort-wasm-simd-threaded.jsep.wasm"]:
    assert (build / "ort" / name).is_file()
# These removed integrations must not reappear through a barrel export or stale build.
for path in build.rglob("*.js"):
    source = path.read_text()
    assert "api.web3forms.com" not in source, path.name
    assert "auth.lineitem.dev" not in source, path.name
print("Personal Firefox identity, permissions, CSP, readers and bundled WASM verified.")
