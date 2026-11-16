import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { createHash } from 'node:crypto';

const file = process.env.SDK_FIXTURE ?? 'candidate_quickstart.js';
const source = readFileSync(new URL(file, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const original = readFileSync(new URL('dist_quickstart.js', import.meta.url));
const provenance = JSON.parse(readFileSync(new URL('provenance.json', import.meta.url), 'utf8'));
assert.equal(createHash('sha256').update(original).digest('hex'), provenance.quickstart_sha256);

// Reviewable dependency-free class excerpts from the actual published/candidate file.
// No package imports, wallet creation, network calls or payment paths execute.
const implementation = source.slice(source.indexOf('class QuickStartAgentImpl {'),
    source.indexOf('// ── FlopAgent Factory'));
const wrapperStart = source.indexOf('    static async quickInference(');
const wrapperEnd = source.indexOf('\n}\n//', wrapperStart);
assert.ok(wrapperStart > 0 && wrapperEnd > wrapperStart);
const wrapper = source.slice(wrapperStart, wrapperEnd);
const api = vm.runInNewContext(`${implementation}\nclass FlopAgent {${wrapper}\n}\n({QuickStartAgentImpl,FlopAgent})`,
    { Date, console, AggregateError });

function instance(purchase) {
    const a = Object.create(api.QuickStartAgentImpl.prototype);
    Object.assign(a, {config: {}, tasksCompleted: 0,
        status: async () => ({dailyBudgetRemaining: 10}),
        selectModel: async () => ({name: 'fixture-model'}),
        client: {buyVerifiedInference: purchase}});
    return a;
}

async function rejectedValue(operation) {
    let rejected = false;
    let value;
    try { await operation(); } catch (error) { rejected = true; value = error; }
    assert.equal(rejected, true, 'operation must reject');
    return value;
}

for (const error of [new Error('fixture purchase failure'), null, undefined]) {
    test(`purchase rejection propagates (${String(error)})`, async () => {
        const a = instance(async () => { throw error; });
        assert.equal(await rejectedValue(() => a.inference('fixture')), error);
        assert.equal(a.tasksCompleted, 0);
    });
}

test('successful purchase preserves receipt and increments metrics', async () => {
    const receipt = {hashLock: 'fixture-hash'};
    const a = instance(async () => receipt);
    const result = await a.inference('fixture');
    assert.equal(result.receipt, receipt);
    assert.equal(result.taskId, receipt.hashLock);
    assert.equal(a.tasksCompleted, 1);
});

for (const mode of ['success', 'create', 'inference', 'shutdown', 'dual', 'null-dual', 'undefined-dual']) {
    test(`wrapper cleanup and error preservation: ${mode}`, async () => {
        const primary = mode === 'null-dual' ? null : mode === 'undefined-dual' ? undefined : new Error('primary');
        const cleanup = new Error('cleanup');
        const answer = {fixture: true};
        let shutdowns = 0;
        api.FlopAgent.create = async () => {
            if (mode === 'create') throw primary;
            return {
                inference: async () => {
                    if (['inference', 'dual', 'null-dual', 'undefined-dual'].includes(mode)) throw primary;
                    return answer;
                },
                shutdown: async () => {
                    shutdowns++;
                    if (['shutdown', 'dual', 'null-dual', 'undefined-dual'].includes(mode)) throw cleanup;
                }
            };
        };
        if (mode === 'success') {
            assert.equal(await api.FlopAgent.quickInference('fixture'), answer);
        } else {
            const error = await rejectedValue(() => api.FlopAgent.quickInference('fixture'));
            if (['dual', 'null-dual', 'undefined-dual'].includes(mode)) {
                assert.ok(error instanceof AggregateError);
                assert.equal(error.errors[0], primary);
                assert.equal(error.errors[1], cleanup);
                assert.equal(error.cause, primary);
            } else assert.equal(error, mode === 'shutdown' ? cleanup : primary);
        }
        assert.equal(shutdowns, mode === 'create' ? 0 : 1);
    });
}
