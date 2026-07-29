import assert from 'assert';
import { Person, WCIF } from '../types';
import { getPersonByWcaUserId } from '../utils/wcif';

console.log('Running Competitor Identifier Unit Tests...\n');

// Helper to create mock WCIF structure
function createMockWCIF(persons: Partial<Person>[]): WCIF {
    return {
        formatVersion: '1.0',
        id: 'MockComp2026',
        name: 'Mock Competition 2026',
        shortName: 'Mock Comp',
        persons: persons.map(p => ({
            registrantId: p.registrantId ?? 1,
            name: p.name ?? 'Test Competitor',
            wcaId: p.wcaId !== undefined ? p.wcaId : null,
            wcaUserId: p.wcaUserId !== undefined ? p.wcaUserId : null,
            countryIso2: 'US',
            gender: 'm',
            birthdate: '2000-01-01',
            email: p.email ?? '',
            roles: [],
            assignments: []
        })) as Person[],
        events: [],
        schedule: {
            startDate: '2026-08-01',
            numberOfDays: 1,
            venues: []
        },
        competitorLimit: 100,
        extensions: []
    };
}

// Helper to create mock database pool
function createMockDb(oauthRows: Record<string, { wca_id: string | null; email: string | null; name: string }>) {
    return {
        query: async (sql: string, params: any[]) => {
            if (sql.includes('SELECT wca_id, email, name FROM oauth_tokens')) {
                const wcaUserId = String(params[0]);
                const row = oauthRows[wcaUserId];
                return [row ? [row] : []];
            }
            return [[]];
        }
    } as any;
}

async function runTests() {
    let passed = 0;
    let failed = 0;

    async function test(name: string, fn: () => Promise<void> | void) {
        try {
            await fn();
            console.log(`✓ PASS: ${name}`);
            passed++;
        } catch (err: any) {
            console.error(`✗ FAIL: ${name}`);
            console.error(`  Error: ${err.message}`);
            failed++;
        }
    }

    // --- TEST 1: Direct wcaUserId match ---
    await test('Direct wcaUserId matching in WCIF', async () => {
        const wcif = createMockWCIF([
            { registrantId: 1, wcaUserId: 1001 as any, wcaId: '2020RETR01', name: 'Returning Competitor' }
        ]);
        const mockDb = createMockDb({});
        
        const result = await getPersonByWcaUserId(wcif, '1001', mockDb);
        assert.ok(result !== null, 'Expected person to be found');
        assert.strictEqual(result?.registrantId, 1);
        assert.strictEqual(result?.name, 'Returning Competitor');
    });

    // --- TEST 2: Multiple First-Time Competitors Resolution ---
    await test('Multiple first-time competitors (all with null wcaId & null wcaUserId in WCIF) resolve to their own unique identities', async () => {
        // WCIF has 5 first-timers, none of whom have a wcaId or wcaUserId in WCIF data
        const wcif = createMockWCIF([
            { registrantId: 101, wcaUserId: null as any, wcaId: null as any, email: 'alice@test.com', name: 'Alice First' },
            { registrantId: 102, wcaUserId: null as any, wcaId: null as any, email: 'bob@test.com', name: 'Bob First' },
            { registrantId: 103, wcaUserId: null as any, wcaId: null as any, email: 'charlie@test.com', name: 'Charlie First' },
            { registrantId: 104, wcaUserId: null as any, wcaId: '', email: 'diana@test.com', name: 'Diana First' },
            { registrantId: 105, wcaUserId: null as any, wcaId: null as any, email: 'evan@test.com', name: 'Evan First' }
        ]);

        const mockDb = createMockDb({
            'u_alice': { wca_id: null, email: 'alice@test.com', name: 'Alice First' },
            'u_bob': { wca_id: null, email: 'bob@test.com', name: 'Bob First' },
            'u_charlie': { wca_id: null, email: 'charlie@test.com', name: 'Charlie First' },
            'u_diana': { wca_id: '', email: 'diana@test.com', name: 'Diana First' },
            'u_evan': { wca_id: null, email: 'evan@test.com', name: 'Evan First' }
        });

        // Test each of the 5 first-timers
        const resAlice = await getPersonByWcaUserId(wcif, 'u_alice', mockDb);
        const resBob = await getPersonByWcaUserId(wcif, 'u_bob', mockDb);
        const resCharlie = await getPersonByWcaUserId(wcif, 'u_charlie', mockDb);
        const resDiana = await getPersonByWcaUserId(wcif, 'u_diana', mockDb);
        const resEvan = await getPersonByWcaUserId(wcif, 'u_evan', mockDb);

        assert.strictEqual(resAlice?.registrantId, 101, 'Alice must map to registrantId 101');
        assert.strictEqual(resAlice?.name, 'Alice First');

        assert.strictEqual(resBob?.registrantId, 102, 'Bob MUST map to registrantId 102 (NOT Alice 101!)');
        assert.strictEqual(resBob?.name, 'Bob First');

        assert.strictEqual(resCharlie?.registrantId, 103, 'Charlie MUST map to registrantId 103 (NOT Alice 101!)');
        assert.strictEqual(resCharlie?.name, 'Charlie First');

        assert.strictEqual(resDiana?.registrantId, 104, 'Diana MUST map to registrantId 104 (NOT Alice 101!)');
        assert.strictEqual(resDiana?.name, 'Diana First');

        assert.strictEqual(resEvan?.registrantId, 105, 'Evan MUST map to registrantId 105 (NOT Alice 101!)');
        assert.strictEqual(resEvan?.name, 'Evan First');
    });

    // --- TEST 3: First-timer name fallback ---
    await test('First-timer name fallback matching when email is missing in DB', async () => {
        const wcif = createMockWCIF([
            { registrantId: 10, wcaUserId: null as any, wcaId: null as any, email: '', name: 'Frank First' },
            { registrantId: 20, wcaUserId: null as any, wcaId: null as any, email: '', name: 'Grace First' }
        ]);
        const mockDb = createMockDb({
            'u_grace': { wca_id: null, email: null, name: 'Grace First' }
        });

        const result = await getPersonByWcaUserId(wcif, 'u_grace', mockDb);
        assert.ok(result !== null, 'Expected Grace to be found by name fallback');
        assert.strictEqual(result?.registrantId, 20, 'Should match Grace First (20), NOT Frank First (10)');
        assert.strictEqual(result?.name, 'Grace First');
    });

    // --- TEST 4: Null/empty wcaId non-collision ---
    await test('Null/empty wcaId does NOT match random first-timer', async () => {
        const wcif = createMockWCIF([
            { registrantId: 1, wcaUserId: null as any, wcaId: null as any, email: 'alice@example.com', name: 'Alice First' },
            { registrantId: 2, wcaUserId: null as any, wcaId: null as any, email: 'bob@example.com', name: 'Bob First' }
        ]);
        const mockDb = createMockDb({
            'u_unknown': { wca_id: '', email: 'unknown@example.com', name: 'Unknown Person' }
        });

        const result = await getPersonByWcaUserId(wcif, 'u_unknown', mockDb);
        assert.strictEqual(result, null, 'Should return null for unknown competitor, not pick Alice or Bob');
    });

    // --- TEST 5: Auto-heal map resolution across multiple first-timers ---
    await test('Auto-heal map resolution correctly matches registrantId for multiple first-timers', async () => {
        const wcif = createMockWCIF([
            { registrantId: 201, wcaUserId: null as any, wcaId: null as any, email: 'ft1@example.com', name: 'First Timer 1' },
            { registrantId: 202, wcaUserId: null as any, wcaId: null as any, email: 'ft2@example.com', name: 'First Timer 2' },
            { registrantId: 203, wcaUserId: null as any, wcaId: null as any, email: 'ft3@example.com', name: 'First Timer 3' }
        ]);
        
        const emailToRegistrantIdMap = new Map<string, number>();
        for (const person of wcif.persons) {
            if (person.email) {
                emailToRegistrantIdMap.set(person.email.trim().toLowerCase(), person.registrantId!);
            }
        }

        assert.strictEqual(emailToRegistrantIdMap.get('ft1@example.com'), 201);
        assert.strictEqual(emailToRegistrantIdMap.get('ft2@example.com'), 202);
        assert.strictEqual(emailToRegistrantIdMap.get('ft3@example.com'), 203);
    });

    console.log(`\nTest Summary: ${passed} passed, ${failed} failed.`);
    if (failed > 0) {
        process.exit(1);
    }
}

runTests();
