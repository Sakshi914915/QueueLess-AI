const app = require('../app');

module.exports = (req, res) => {
  const apiPath = req.query && req.query.path;
  if (typeof apiPath !== 'string' || !apiPath) {
    return res.status(404).json({ success: false, message: 'Route not found.' });
  }

  const queryIndex = req.url.indexOf('?');
  const query = new URLSearchParams(queryIndex >= 0 ? req.url.slice(queryIndex + 1) : '');
  query.delete('path');
  const queryString = query.toString();
  req.url = `/api/${apiPath}${queryString ? `?${queryString}` : ''}`;

  return app(req, res);
};
