import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));

test('deployment keeps migrations and seed outside the API restart path', async () => {
  const [dockerfile, compose] = await Promise.all([
    readFile(`${repositoryRoot}apps/api/Dockerfile`, 'utf8'),
    readFile(`${repositoryRoot}docker-compose.yml`, 'utf8'),
  ]);

  assert.match(
    dockerfile,
    /CMD \["npm", "--prefix", "apps\/api", "start"\]/,
  );
  assert.doesNotMatch(dockerfile, /run seed/);
  assert.doesNotMatch(dockerfile, /run migrate/);

  const apiService = compose.slice(
    compose.indexOf('\n  api:'),
    compose.indexOf('\n  migrate:'),
  );
  assert.doesNotMatch(apiService, /SEED_ADMIN_/);
  assert.match(compose, /profiles: \["ops"\]/);
  assert.match(compose, /profiles: \["bootstrap"\]/);
  assert.match(compose, /MIGRATOR_DATABASE_URL/);
});
