import type { Metadata } from "next";
import InvoiceChecker from "../components/InvoiceChecker";

export const metadata: Metadata = {
  title: "Verificar Fatura — ADSE Navegador",
  description:
    "Verifique se os valores da sua fatura ADSE correspondem à tabela do Regime Convencionado.",
};

export default function VerificarFaturaPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Verificar Fatura</h1>
        <p className="text-sm text-gray-500 mt-1">
          Carregue uma fatura PDF de prestador convencionado ADSE para comparar
          os valores cobrados com a tabela oficial.
        </p>
      </div>
      <InvoiceChecker />
    </div>
  );
}
