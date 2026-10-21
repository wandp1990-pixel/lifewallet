import { ownerApi } from '@/lib/ledger-api'
import { NextRequest, NextResponse } from 'next/server'
import { ledgerWrite, saveCategory, deleteCategory } from '@/lib/ledger-service'
import { requestKey } from '@/lib/ledger-api'
async function handlePATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const key = requestKey(req)
  const result = await ledgerWrite('app.update_category', key, {id,body}, tx => saveCategory(tx, key, body, id))
  return NextResponse.json(result.category)
}

async function handleDELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const key = requestKey(req)
  const result = await ledgerWrite('app.delete_categories', key, {id}, tx => deleteCategory(tx, key, id))
  return NextResponse.json(result)
}

export const PATCH = ownerApi(handlePATCH)
export const DELETE = ownerApi(handleDELETE)
