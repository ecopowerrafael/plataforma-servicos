import { type FastifyRequest } from 'fastify';

import { type RequestMetadata } from './identity.repository.js';

export function requestMetadata(request: FastifyRequest): RequestMetadata {
  const userAgent = request.headers['user-agent'];
  return {
    ipAddress: request.ip.slice(0, 45) || null,
    userAgent: userAgent === undefined ? null : userAgent.slice(0, 255),
  };
}
