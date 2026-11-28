"""Measure Pi 1.7.0 OpenAI Chat Completions request bodies on loopback.

Run with Python 3 and tiktoken==0.12.0. No provider credentials required.
The baseline fixture is captured from the installed extension before candidate edits.
"""
import argparse
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import threading

import tiktoken

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / 'packages/pi-goal-x-lean/tests/fixtures/provider-baseline.json'
ENC = tiktoken.encoding_for_model('gpt-4o')


def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))


def tokens(text):
    return len(ENC.encode_ordinary(text))


def capture(extension, prompts, steps):
    requests = []

    class Endpoint(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def do_POST(self):
            body = self.rfile.read(int(self.headers['Content-Length'])).decode()
            idx = len(requests)
            requests.append(body)
            delta = {'content': 'Done.'}
            finish = 'stop'
            if idx < len(steps) and steps[idx]:
                name, args = steps[idx]
                delta = {'tool_calls': [{'index': 0, 'id': f'call_{idx}', 'type': 'function',
                                         'function': {'name': name, 'arguments': compact(args)}}]}
                finish = 'tool_calls'
            data = {'id': 'completion', 'object': 'chat.completion.chunk', 'model': 'gpt-4o',
                    'choices': [{'index': 0, 'delta': delta, 'finish_reason': finish}]}
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.end_headers()
            self.wfile.write(f'data: {compact(data)}\n\ndata: [DONE]\n\n'.encode())

    with HTTPServer(('127.0.0.1', 0), Endpoint) as server, tempfile.TemporaryDirectory() as tmp:
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        agent = Path(tmp) / 'agent'
        agent.mkdir()
        provider = {'baseUrl': f'http://127.0.0.1:{server.server_port}/v1', 'api': 'openai-completions',
                    'apiKey': 'measurement', 'models': [{'id': 'gpt-4o'}]}
        (agent / 'models.json').write_text(compact({'providers': {'local': provider}}))
        sdk = os.environ.get('PI_CODING_AGENT_MODULE', Path.home() / '.pi/agent/install/releases/1.7.0/node_modules/@earendil-works/pi-coding-agent/dist/index.js')
        cmd = ['node', str(FIXTURE.with_name('provider-session.mjs')), str(sdk), str(extension or '')]
        env = {'PATH': os.environ['PATH'], 'HOME': tmp, 'PI_CODING_AGENT_DIR': str(agent),
               'PI_GOAL_ROOT': tmp + '/goals', 'PI_GOAL_AUTO_CONFIRM': '1', 'LANG': 'C.UTF-8', 'TZ': 'UTC'}
        try:
            run = subprocess.run([*cmd, *prompts], cwd=tmp, env=env, input='', capture_output=True,
                                 text=True, timeout=40)
        finally:
            server.shutdown()
        events = [json.loads(line) for line in run.stdout.split('\n') if line.startswith('{')]
        # Pi emits one tool_execution_end for each model-issued call and another
        # for every nested ctx.executeTool call. Only the former is a provider
        # turn result; counting both made one goal call look like several turns.
        results = [e for e in events if e['type'] == 'tool_execution_end' and 'parentToolCallId' not in e]
        nested = [e for e in events if e['type'] == 'tool_execution_end' and 'parentToolCallId' in e]
        assert run.returncode == 0 and requests, (run.stderr, run.stdout[-2000:])
        assert [r['toolName'] for r in results] == [s[0] for s in steps if s], (run.stderr, results)
        # Canonicalize ephemeral host paths, calendar date and goal record IDs only.
        def stable(body):
            body = body.replace(str(Path(sdk).parent.parent), '/opt/pi-1.7.0')
            for result in results + nested:
                goal = (result['result'].get('details') or {}).get('goal') or {}
                if goal.get('activePath'):
                    body = body.replace(goal['activePath'], '.pi/goals/active_goal_fixture.md')
                if goal.get('id'):
                    body = body.replace(goal['id'], 'fixture-goal')
            body = body.replace(tmp, '/tmp/goal-measure')
            body = re.sub(r'\b\d{4}-\d\d-\d\d\b', '2026-01-01', body)
            return re.sub(r'\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b',
                          '00000000-0000-4000-8000-000000000000', body)
        return [stable(b) for b in requests], results, nested, sum(e['type'] == 'auto_retry_start' for e in events)


def report(extension):
    plain = capture(None, ['Hello'], [None])[0][0]
    body = capture(extension, ['Hello'], [None])[0][0]
    p, b = json.loads(plain), json.loads(body)
    common = {t['function']['name'] for t in p['tools']}
    goal = [t for t in b['tools'] if t['function']['name'] not in common]
    assert goal
    metrics = dict(names=[t['function']['name'] for t in goal], tools=tokens(compact(b['tools']))-tokens(compact(p['tools'])),
                prompt=tokens(b['messages'][0]['content'])-tokens(p['messages'][0]['content']),
                bodyDelta=tokens(body)-tokens(plain), plain=tokens(plain), ordinary=tokens(body),
                goalSurface=tokens(compact(b['tools']))-tokens(compact(p['tools']))
                            + tokens(b['messages'][0]['content'])-tokens(p['messages'][0]['content']))

    routed = 'goal' in metrics['names']
    def call(name, args):
        if routed and name != 'get_goal':
            return 'goal', {'op': name, 'input': compact(args)}
        return name, args

    task = {'id': 'verify', 'title': 'Verify output', 'verification_contract': 'Record a passing check'}
    proposal = call('propose_goal_draft', {'objective': 'Check CSV export', 'tasks': [task], 'auto_continue': False})
    start = call('update_goal_task', {'task_id': 'verify', 'status': 'start'})
    finish = call('update_goal_task', {'task_id': 'verify', 'status': 'complete', 'evidence': 'CSV check passed'})
    draft = '/goal Check CSV export'
    cases = {
        'read': (['Read goal status.'], [call('get_goal', {}), None]),
        'draft': ([draft, 'Review the result.'], [proposal, None]),
        'task': ([draft, 'Start and finish verification.'], [proposal, start, finish, None]),
        'taskRetry': ([draft, 'Start and finish verification.'], [proposal,
                      call('update_goal_task', {'task_id': 'verify', 'status': 'in_progress'}), start, finish, None]),
    }
    if routed:
        topics = ['get_goal', 'create_goal', 'update_goal', 'set_goal_tasks', 'update_goal_task',
                  'goal_questionnaire', 'propose_goal_draft']
        help_metrics = {}
        for topic in topics:
            bodies, results, _, retries = capture(extension, ['Hello'], [('goal', {'op': 'help', 'input': topic}), None])
            assert len(bodies) == 2 and not retries, (topic, len(bodies), retries)
            assert len(results) == 1 and not results[0]['isError'], (topic, results)
            text = results[0]['result']['content'][0]['text']
            assert topic in text and 'Example:' in text, (topic, text)
            counts = list(map(tokens, bodies))
            help_metrics[topic] = dict(resultTokens=tokens(text),
                                       nextRequestIncrement=counts[1] - counts[0],
                                       cumulativeIncrement=sum(counts) - metrics['ordinary'])
        bodies, results, _, retries = capture(extension, ['Hello'], [('goal', {'op': 'help'}), None])
        assert len(bodies) == 2 and len(results) == 1 and not retries, (len(bodies), results, retries)
        counts = list(map(tokens, bodies))
        help_metrics['index'] = dict(resultTokens=tokens(results[0]['result']['content'][0]['text']),
                                    nextRequestIncrement=counts[1] - counts[0],
                                    cumulativeIncrement=sum(counts) - metrics['ordinary'])
        metrics['help'] = help_metrics
    for name, (prompts, steps) in cases.items():
        bodies, results, nested, retries = capture(extension, prompts, steps)
        assert len(bodies) == len(steps), (name, len(bodies), steps)
        assert len(results) == sum(1 for step in steps if step), (name, len(results), results)
        if routed:
            assert len(nested) == sum(1 for name, _ in (s for s in steps if s)
                                      if name != 'get_goal'), (name, nested)
        errors = [r['toolCallId'] for r in results if r['isError']]
        assert errors == (['call_1'] if name == 'taskRetry' else []), (name, errors, results)
        if name in ('draft', 'task', 'taskRetry'):
            assert results[0]['result']['details']['goal']['objective'] == 'Check CSV export'
        if name.startswith('task'):
            assert results[-1]['result']['details']['goal']['taskList']['tasks'][0]['evidence'] == 'CSV check passed'
        counts = list(map(tokens, bodies))
        metrics[name] = dict(perRequest=counts, providerTurns=len(bodies), toolCalls=len(results),
                             nestedCalls=len(nested), cumulative=sum(counts),
                             providerRetries=retries, argumentRetries=len(errors))
    return metrics


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--extension', type=Path, default=ROOT/'packages/pi-goal-x-lean/index.ts')
    parser.add_argument('--capture', action='store_true', help='Print standalone measurements')
    args = parser.parse_args()
    measured = report(args.extension.resolve())
    if args.capture:
        print(json.dumps(measured, indent=2))
    else:
        baseline = json.loads(FIXTURE.read_text())['metrics']
        print(json.dumps({'installedBaseline': baseline, 'candidate': measured}, indent=2))
        assert measured['names'] == ['get_goal', 'goal']
        assert measured['bodyDelta'] < baseline['bodyDelta']
        assert measured['goalSurface'] <= 220, measured['goalSurface']
        for name in ('read', 'draft', 'task', 'taskRetry'):
            assert measured[name]['cumulative'] < baseline[name]['cumulative'], name
