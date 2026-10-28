import { allInvestmentQuotes, putInvestmentBuy, putInvestmentQuote, putInvestmentSale } from './db'
import { assetKey } from './invest'
import type { AssetKind } from './taxes'
import { newId, nowISO, type InvestmentBuy, type InvestmentSale } from './types'

/** Acoes de investimentos: gravam local primeiro, igual ao resto do app. */

export async function buyAsset(draft: {
  asset: string
  quantity: number
  price: number
  bought_on: string
  kind: AssetKind
}): Promise<InvestmentBuy> {
  const now = nowISO()
  const buy: InvestmentBuy = {
    id: newId(),
    user_id: null,
    asset: assetKey(draft.asset),
    quantity: draft.quantity,
    price: draft.price,
    bought_on: draft.bought_on,
    kind: draft.kind,
    deleted: false,
    created_at: now,
    updated_at: now,
  }
  await putInvestmentBuy(buy)
  return buy
}

export async function deleteBuy(buy: InvestmentBuy) {
  await putInvestmentBuy({ ...buy, deleted: true, updated_at: nowISO() })
}

/** Corrige o tipo do ativo em todas as compras dele (o imposto depende disso). */
export async function setAssetKind(asset: string, kind: AssetKind, buys: InvestmentBuy[]) {
  for (const buy of buys.filter((b) => b.asset === asset && b.kind !== kind))
    await putInvestmentBuy({ ...buy, kind, updated_at: nowISO() })
}

export async function sellAsset(draft: {
  asset: string
  quantity: number
  price: number
  sold_on: string
}): Promise<InvestmentSale> {
  const now = nowISO()
  const sale: InvestmentSale = {
    id: newId(),
    user_id: null,
    asset: assetKey(draft.asset),
    quantity: draft.quantity,
    price: draft.price,
    sold_on: draft.sold_on,
    deleted: false,
    created_at: now,
    updated_at: now,
  }
  await putInvestmentSale(sale)
  return sale
}

export async function deleteSale(sale: InvestmentSale) {
  await putInvestmentSale({ ...sale, deleted: true, updated_at: nowISO() })
}

/** Cotacao do dia: informar de novo no mesmo dia corrige, nao duplica. */
export async function setQuote(asset: string, price: number, quoted_on: string) {
  const key = assetKey(asset)
  const existing = (await allInvestmentQuotes()).find(
    (q) => q.asset === key && q.quoted_on === quoted_on,
  )
  await putInvestmentQuote({
    id: existing?.id ?? newId(),
    user_id: existing?.user_id ?? null,
    asset: key,
    price,
    quoted_on,
    updated_at: nowISO(),
  })
}

/** Aceita "1.234,56", "1234,56" e "1234.56". */
export function parseDecimal(text: string): number {
  const clean = text.trim().replace(/\s/g, '')
  const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean
  const value = Number.parseFloat(normalized)
  return Number.isFinite(value) ? value : Number.NaN
}
