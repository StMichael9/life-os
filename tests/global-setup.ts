import { seedE2E } from '../packages/api/src/e2e-fixtures';
export default async function setup() {
  if (process.env.LIFE_OS_E2E_DATABASE_URL) await seedE2E(process.env.LIFE_OS_E2E_DATABASE_URL);
}
