/**
 * Nome de canal único por montagem do componente.
 *
 * O supabase-js devolve o canal já existente quando o nome se repete. Ao trocar de tela
 * (Painel ↔ Fila) ou reabrir uma aba, o canal antigo ainda está saindo; a tela nova
 * recebia esse canal "de saída" e deixava de receber atualizações em tempo real.
 */
export const nomeCanal = (prefixo: string) => `${prefixo}-${Math.random().toString(36).slice(2, 10)}`;
