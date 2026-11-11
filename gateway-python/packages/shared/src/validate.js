import schema from '../schema/envelope.v1.schema.json' with { type: 'json' };

const ORIGINS = ['medido', 'calculado', 'simulado'];
const QUALITY = ['GOOD', 'UNCERTAIN', 'BAD'];

export function validateEnvelope(env) {
  const { message_id, unit_id, asset_id, tag, value, origin,
          quality, stream_id, seq } = env ?? {};
  if (!message_id || !unit_id || !asset_id || !tag)
    throw new Error('Identidade incompleta no envelope');
  if (!ORIGINS.includes(origin)) throw new Error(`origin inválida: ${origin}`);
  if (!QUALITY.includes(quality?.status)) throw new Error('quality.status inválido');
  if (typeof stream_id !== 'string' || !Number.isInteger(seq))
    throw new Error('stream_id/seq inválidos');
  const okType = value === null
    || ['string', 'boolean', 'number'].includes(typeof value)
    || Array.isArray(value);
  if (!okType) throw new Error(`value inesperado para ${tag}`);
  return env;
}

export { schema };