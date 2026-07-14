const jwksClient = require('jwks-rsa');
const jwt = require('jsonwebtoken');

const client = jwksClient({
  jwksUri: 'https://login.microsoftonline.com/common/discovery/v2.0/keys',
});

function getKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    callback(null, key.getPublicKey());
  });
}

// Your Entra app's client ID / API resource identifier.
const EXPECTED_AUDIENCE = 'api://cmp-sales.vercel.app/faa6023c-5645-440e-bc4a-f760ee262f4b';

function verifyTeamsToken(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization token' });
  }

  jwt.verify(token, getKey, { audience: EXPECTED_AUDIENCE }, (err, decoded) => {
    if (err) {
      console.error('Token verification failed:', err.message);
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    // Attach the verified identity to the request for routes to use.
    req.teamsUser = {
      name: decoded.name || `${decoded.given_name || ''} ${decoded.family_name || ''}`.trim(),
      email: decoded.preferred_username || decoded.email || '',
    };
    next();
  });
}

module.exports = { verifyTeamsToken };
