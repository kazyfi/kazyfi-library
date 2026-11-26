import { createApiApp } from '../server/app.ts';

const app = createApiApp({ enableBackgroundScheduler: false });

export default app;
