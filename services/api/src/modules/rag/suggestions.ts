import type { Suggestion } from "@torquespec/shared-types";

/** Atalhos ("chips") exibidos no app para as buscas mais recorrentes. */
export const SUGGESTIONS: Suggestion[] = [
  { id: "oil-change", label: "Troca de óleo", question: "Qual o óleo recomendado e a capacidade na troca com filtro?" },
  { id: "wiring", label: "Esquema elétrico", question: "Quais são os fusíveis e a especificação da bateria?" },
  { id: "tire-pressure", label: "Pressão dos pneus", question: "Qual a pressão dos pneus dianteiro e traseiro?" },
  { id: "torque", label: "Aperto de parafusos", question: "Quais são os principais torques de aperto?" },
  { id: "valves", label: "Folga de válvulas", question: "Qual a folga das válvulas de admissão e escape?" },
  { id: "chain", label: "Corrente", question: "Qual a folga correta da corrente de transmissão?" },
];
