"""Read-only FLOP devnet integration; Python standard library only."""
import argparse
import datetime as dt
import json
from pathlib import Path
import urllib.error
import urllib.request

GENESIS = '0x99c172c095340ace980631f9123544c6bebd4839f3437e463533422d8be2d631'
ORIGINS = {
    'gateway': 'https://api.flop.network',
    'faucet': 'https://faucet.flop.network',
    'rpc': 'https://rpc.devnet.flop.network',
    'explorer': 'https://explorer.devnet.flop.network',
    'mcp': 'https://mcp.flop.network',
}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def fetch(service, path, payload=None, token=None, extra_headers=None):
    if token and (service != 'gateway' or path != '/v1/keys/me'):
        raise ValueError('Credential destination refused')
    headers = {'User-Agent': 'flop-agent-probe/0.1', 'Accept': 'application/json'}
    headers.update(extra_headers or {})
    if token:
        headers['Authorization'] = 'Bearer ' + token
    if payload is not None:
        headers['Content-Type'] = 'application/json'
    request = urllib.request.Request(
        ORIGINS[service] + path, headers=headers,
        data=None if payload is None else json.dumps(payload).encode(),
    )
    try:
        try:
            response = urllib.request.build_opener(NoRedirect()).open(request, timeout=20)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            raw = response.read(2_000_000).decode('utf-8')
            try:
                data = json.loads(raw)
            except ValueError:
                packets = [json.loads(line[5:].strip()) for line in raw.splitlines()
                           if line.startswith('data:')]
                data = packets[-1] if packets else {'error': 'non_json_response'}
            return response.status, data, response.headers.get('Mcp-Session-Id')
    except (OSError, ValueError):
        return None, {'error': 'transport_or_format_error'}, None


class MCP:
    def __init__(self):
        self.session = None
        self.counter = 0

    def call(self, method, params):
        self.counter += 1
        body = {'jsonrpc': '2.0', 'method': method, 'params': params}
        if method != 'notifications/initialized':
            body['id'] = self.counter
        headers = {'Accept': 'application/json, text/event-stream',
                   'MCP-Protocol-Version': '2025-03-26'}
        if self.session:
            headers['Mcp-Session-Id'] = self.session
        status, data, session = fetch('mcp', '/mcp', body, extra_headers=headers)
        self.session = session or self.session
        return {'http_status': status, 'response': data}

    def tool(self, name, arguments):
        result = self.call('tools/call', {'name': name, 'arguments': arguments})
        blocks = result['response'].get('result', {}).get('content', [])
        if not result['response'].get('result', {}).get('isError'):
            for block in blocks:
                if block.get('type') == 'text':
                    try:
                        result['data'] = json.loads(block['text'])
                        break
                    except ValueError:
                        pass
        return result


def run(credential_file):
    report = {'checked_at': dt.datetime.now(dt.timezone.utc).isoformat(),
              'mode': 'read_only', 'inference_submitted': False, 'services': {}}
    for name, service, path, body in [
        ('gateway_health', 'gateway', '/health', None),
        ('models', 'gateway', '/v1/models', None),
        ('chain', 'faucet', '/chain', None),
        ('rpc_genesis', 'rpc', '', {'jsonrpc': '2.0', 'id': 1,
                                  'method': 'chain_getBlockHash', 'params': [0]}),
        ('offers', 'explorer', '/api/session-offers?limit=100', None),
    ]:
        status, data, _ = fetch(service, path, body)
        report['services'][name] = {'http_status': status, 'data': data}
    chain = report['services']['chain']['data'].get('genesisHash')
    rpc = report['services']['rpc_genesis']['data'].get('result')
    report['network_identity_verified'] = chain == rpc == GENESIS
    report['credential'] = {'state': 'not_checked'}
    if credential_file:
        try:
            stored = json.loads(Path(credential_file).read_text(encoding='utf-8'))
            token = next(stored[k] for k in ('key', 'api_key', 'token', 'credential')
                         if isinstance(stored.get(k), str) and stored[k])
        except (OSError, ValueError, StopIteration):
            report['credential'] = {'state': 'local_credential_unavailable'}
        else:
            status, data, _ = fetch('gateway', '/v1/keys/me', token=token)
            report['credential'] = {'http_status': status, **{
                k: data[k] for k in ('error', 'expires_at', 'remaining_quota', 'model_allowlist')
                if k in data}}
            del token
    mcp = MCP()
    report['mcp_initialize'] = mcp.call('initialize', {
        'protocolVersion': '2025-03-26', 'capabilities': {},
        'clientInfo': {'name': 'flop-agent-probe', 'version': '0.1.0'}})
    mcp.call('notifications/initialized', {})
    report['discovery'] = mcp.tool('flop_discover_models', {})
    report['prices_200_tokens'] = []
    for model in report['discovery'].get('data', {}).get('models', []):
        if not isinstance(model.get('modelHash'), str):
            continue
        report['prices_200_tokens'].append({
            'model': model.get('modelName'),
            'pricing': mcp.tool('flop_get_model_pricing', {
                'model_id': model['modelHash'], 'tokens_estimate': 200})})
    report['providers'] = mcp.tool('flop_list_providers', {'provider_type': 'all'})
    report['limitations'] = [
        'Discovery and estimates do not establish admission, worker readiness or settlement.',
        'No signature, enrollment, faucet grant, inference or chain transaction was submitted.',
        'A successful credential read alone does not verify model scope for a paid request.',
    ]
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', default='output')
    parser.add_argument('--credential-file', help='Optional local owner JSON; never copied to reports')
    args = parser.parse_args()
    report = run(args.credential_file)
    folder = Path(args.output)
    folder.mkdir(parents=True, exist_ok=True)
    (folder / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    rows = ['# FLOP devnet probe', '', 'Checked: ' + report['checked_at'], '',
            'Read-only; inference and settlement have not been performed.', '',
            'Network identity verified: ' + str(report['network_identity_verified']),
            'Gateway status: ' + str(report['services']['gateway_health']['data'].get('status')),
            'Credential: ' + json.dumps(report['credential']), '',
            '| Model | Estimate for 200 tokens |', '|---|---|']
    for row in report['prices_200_tokens']:
        price = row['pricing'].get('data', {}).get('estimatedCostForTokens', 'unknown')
        rows.append('| ' + str(row['model']) + ' | ' + str(price) + ' |')
    (folder / 'REPORT.md').write_text('\n'.join(rows) + '\n', encoding='utf-8')
    print(json.dumps({'report': str((folder / 'REPORT.md').resolve()),
                      'network_identity_verified': report['network_identity_verified'],
                      'credential': report['credential'],
                      'priced_models': len(report['prices_200_tokens']),
                      'inference_submitted': False}))


if __name__ == '__main__':
    main()
