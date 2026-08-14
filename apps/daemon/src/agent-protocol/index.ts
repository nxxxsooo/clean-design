/** @module agent-protocol
 * Pi RPC subprocess protocol adapter, sharing a JSON-line-stream transport
 * from core/. External daemon code imports only from this barrel.
 */
export { createJsonLineStream } from './core/index.js';
export { mapPiRpcEvent, attachPiRpcSession, parsePiModels } from './pi-rpc/index.js';
