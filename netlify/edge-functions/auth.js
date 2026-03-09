export default async function auth(request, context) {
  const user = Deno.env.get('AUTH_USER');
  const pass = Deno.env.get('AUTH_PASS');

  if (!user || !pass) {
    return context.next();
  }

  const authorization = request.headers.get('Authorization');
  if (authorization) {
    const [scheme, encoded] = authorization.split(' ');
    if (scheme === 'Basic' && encoded) {
      const decoded = atob(encoded);
      const colon = decoded.indexOf(':');
      if (colon !== -1) {
        const providedUser = decoded.slice(0, colon);
        const providedPass = decoded.slice(colon + 1);
        if (providedUser === user && providedPass === pass) {
          return context.next();
        }
      }
    }
  }

  return new Response('Unauthorized', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Firefly Game"',
    },
  });
}
