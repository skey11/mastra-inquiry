import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono();
app.use('*', cors({ origin: ['https://example.com'], credentials: true }));

app.get('/', (c) => {
  throw new Error('boom');
});

app.onError((err, c) => {
  return c.json({ message: err.message }, 500);
});

const res = await app.fetch(
  new Request('http://localhost/', {
    headers: {
      Origin: 'https://example.com',
    },
  }),
);
console.log(res.status, Object.fromEntries(res.headers.entries()));
