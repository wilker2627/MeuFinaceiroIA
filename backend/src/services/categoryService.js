import { prisma } from '../config/database.js'

const DEFAULT_CATEGORIES = [
  // DESPESAS
  { name: 'Estoque', type: 'EXPENSE', color: '#FF6B6B', icon: '📦' },
  { name: 'Funcionários', type: 'EXPENSE', color: '#FF8E53', icon: '👥' },
  { name: 'Aluguel', type: 'EXPENSE', color: '#A855F7', icon: '🏢' },
  { name: 'Marketing', type: 'EXPENSE', color: '#3B82F6', icon: '📣' },
  { name: 'Energia', type: 'EXPENSE', color: '#EAB308', icon: '⚡' },
  { name: 'Combustível', type: 'EXPENSE', color: '#F97316', icon: '⛽' },
  { name: 'Alimentação', type: 'EXPENSE', color: '#10B981', icon: '🍽️' },
  { name: 'Transporte', type: 'EXPENSE', color: '#6366F1', icon: '🚗' },
  { name: 'Saúde', type: 'EXPENSE', color: '#EC4899', icon: '🏥' },
  { name: 'Serviços', type: 'EXPENSE', color: '#14B8A6', icon: '🔧' },
  { name: 'Equipamentos', type: 'EXPENSE', color: '#8B5CF6', icon: '🖥️' },
  { name: 'Impostos', type: 'EXPENSE', color: '#DC2626', icon: '🧾' },
  { name: 'Internet/Telefone', type: 'EXPENSE', color: '#0EA5E9', icon: '📱' },
  { name: 'Outros', type: 'EXPENSE', color: '#6B7280', icon: '📝' },
  // RECEITAS
  { name: 'Vendas', type: 'INCOME', color: '#22C55E', icon: '🛍️' },
  { name: 'Serviços Prestados', type: 'INCOME', color: '#10B981', icon: '💼' },
  { name: 'Comissões', type: 'INCOME', color: '#84CC16', icon: '💰' },
  { name: 'Outros Recebimentos', type: 'INCOME', color: '#6B7280', icon: '📥' }
]

export async function seedDefaultCategories(tenantId) {
  for (const cat of DEFAULT_CATEGORIES) {
    await prisma.category.upsert({
      where: { tenantId_name: { tenantId, name: cat.name } },
      update: {},
      create: { tenantId, ...cat }
    })
  }
}
