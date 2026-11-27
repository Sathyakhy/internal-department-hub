import React, { useState } from 'react';
import { Building2, Edit2, Package, Plus, Trash2, Truck, X } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { downloadExcelTemplate } from '../../utils/excel';
import { ExcelImportActions } from '../common/ExcelImportActions';

type ConfigTab = 'customers' | 'vendors' | 'products';

export const ProjectConfigView: React.FC = () => {
  const {
    state,
    canEdit,
    createCustomer,
    updateCustomer,
    deleteCustomer,
    createVendor,
    updateVendor,
    deleteVendor,
    createProduct,
    updateProduct,
    deleteProduct,
    importConfigEntities,
    notify,
  } = useAppStore();

  const editable = canEdit('project-config');
  const [tab, setTab] = useState<ConfigTab>('customers');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', secondary: '', tertiary: '' });

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: '', secondary: '', tertiary: '' });
    setModalOpen(true);
  };

  const openEdit = (id: string, name: string, secondary: string, tertiary: string) => {
    setEditingId(id);
    setForm({ name, secondary, tertiary });
    setModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editable || !form.name.trim()) return;
    if (tab === 'customers') {
      const payload = {
        name: form.name.trim(),
        industry: form.secondary.trim(),
        contactEmail: form.tertiary.trim(),
      };
      editingId ? updateCustomer(editingId, payload) : createCustomer(payload);
    } else if (tab === 'vendors') {
      const payload = {
        name: form.name.trim(),
        specialty: form.secondary.trim(),
        contactEmail: form.tertiary.trim(),
      };
      editingId ? updateVendor(editingId, payload) : createVendor(payload);
    } else {
      const payload = {
        name: form.name.trim(),
        code: form.secondary.trim(),
        description: form.tertiary.trim(),
      };
      editingId ? updateProduct(editingId, payload) : createProduct(payload);
    }
    setModalOpen(false);
  };

  const labels = {
    customers: { title: 'Customers', sLabel: 'Industry', tLabel: 'Contact Email', Icon: Building2 },
    vendors: { title: 'Vendors', sLabel: 'Specialty', tLabel: 'Support Email', Icon: Truck },
    products: { title: 'Products', sLabel: 'Product Code', tLabel: 'Description', Icon: Package },
  }[tab];

  const isEmpty =
    (tab === 'customers' && state.customers.length === 0) ||
    (tab === 'vendors' && state.vendors.length === 0) ||
    (tab === 'products' && state.products.length === 0);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-neutral-100 dark:bg-zinc-900 rounded-lg">
          {(['customers', 'vendors', 'products'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors ${
                tab === t
                  ? 'bg-white dark:bg-black text-neutral-900 dark:text-neutral-100 shadow-sm'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {editable && (
          <div className="flex items-center gap-2">
            <ExcelImportActions
              templateTitle={`Download ${labels.title} Excel Template (.xlsx)`}
              importTitle={`Import ${labels.title} from Excel (.xlsx / .csv)`}
              onDownloadTemplate={() => {
                if (tab === 'customers') {
                  downloadExcelTemplate('customers-import-template.xlsx', 'Customers', [
                    { header: 'Name', example: 'Acme Logistics', width: 24 },
                    { header: 'Industry', example: 'Supply Chain', width: 20 },
                    { header: 'Contact Email', example: 'ops@acmelogistics.com', width: 28 },
                  ]);
                } else if (tab === 'vendors') {
                  downloadExcelTemplate('vendors-import-template.xlsx', 'Vendors', [
                    { header: 'Name', example: 'CloudNet Partners', width: 24 },
                    { header: 'Specialty', example: 'Cloud Infrastructure', width: 22 },
                    { header: 'Support Email', example: 'support@cloudnet.io', width: 28 },
                  ]);
                } else {
                  downloadExcelTemplate('products-import-template.xlsx', 'Products', [
                    { header: 'Name', example: 'Fleet Core Suite', width: 24 },
                    { header: 'Product Code', example: 'FCS-01', width: 16 },
                    { header: 'Description', example: 'Primary telemetry & fleet management platform', width: 40 },
                  ]);
                }
              }}
              onImportRows={(rows) => importConfigEntities(tab, rows)}
              onError={(msg) => notify(msg, 'error')}
            />
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium"
            >
              <Plus className="h-4 w-4" />
              <span>Add {labels.title.slice(0, -1)}</span>
            </button>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-neutral-200 dark:border-zinc-800 text-xs font-medium text-neutral-500 dark:text-neutral-400">
              <th className="py-3 px-4">Name</th>
              <th className="py-3 px-4">{labels.sLabel}</th>
              <th className="py-3 px-4">{labels.tLabel}</th>
              {editable && <th className="py-3 px-4 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-zinc-800 text-sm">
            {tab === 'customers' &&
              state.customers.map((c) => (
                <tr key={c.id} className="hover:bg-neutral-50 dark:hover:bg-zinc-900/60">
                  <td className="py-3 px-4 font-medium text-neutral-900 dark:text-neutral-100">{c.name}</td>
                  <td className="py-3 px-4 text-xs text-neutral-600 dark:text-neutral-400">{c.industry}</td>
                  <td className="py-3 px-4 text-xs font-mono-tabular text-neutral-600 dark:text-neutral-400">
                    {c.contactEmail}
                  </td>
                  {editable && (
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openEdit(c.id, c.name, c.industry, c.contactEmail)}
                        className="p-1.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteCustomer(c.id)}
                        className="p-1.5 text-neutral-400 hover:text-red-600 dark:hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}

            {tab === 'vendors' &&
              state.vendors.map((v) => (
                <tr key={v.id} className="hover:bg-neutral-50 dark:hover:bg-zinc-900/60">
                  <td className="py-3 px-4 font-medium text-neutral-900 dark:text-neutral-100">{v.name}</td>
                  <td className="py-3 px-4 text-xs text-neutral-600 dark:text-neutral-400">{v.specialty}</td>
                  <td className="py-3 px-4 text-xs font-mono-tabular text-neutral-600 dark:text-neutral-400">
                    {v.contactEmail}
                  </td>
                  {editable && (
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openEdit(v.id, v.name, v.specialty, v.contactEmail)}
                        className="p-1.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteVendor(v.id)}
                        className="p-1.5 text-neutral-400 hover:text-red-600 dark:hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}

            {tab === 'products' &&
              state.products.map((p) => (
                <tr key={p.id} className="hover:bg-neutral-50 dark:hover:bg-zinc-900/60">
                  <td className="py-3 px-4 font-medium text-neutral-900 dark:text-neutral-100">{p.name}</td>
                  <td className="py-3 px-4 text-xs font-mono-tabular text-sky-600 dark:text-sky-400">{p.code}</td>
                  <td className="py-3 px-4 text-xs text-neutral-600 dark:text-neutral-400">{p.description}</td>
                  {editable && (
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openEdit(p.id, p.name, p.code, p.description)}
                        className="p-1.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteProduct(p.id)}
                        className="p-1.5 text-neutral-400 hover:text-red-600 dark:hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}

            {isEmpty && (
              <tr>
                <td
                  colSpan={editable ? 4 : 3}
                  className="py-10 px-4 text-center text-sm text-neutral-500 dark:text-neutral-400"
                >
                  No {labels.title.toLowerCase()} added yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/65" onClick={() => setModalOpen(false)} />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-[#0A0A0C] p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-display font-semibold text-neutral-900 dark:text-neutral-100">
                {editingId ? `Edit ${labels.title.slice(0, -1)}` : `Add ${labels.title.slice(0, -1)}`}
              </h3>
              <button type="button" onClick={() => setModalOpen(false)} className="text-neutral-400 hover:text-neutral-200">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Name</label>
                <input
                  required
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                  {labels.sLabel}
                </label>
                <input
                  required
                  type="text"
                  value={form.secondary}
                  onChange={(e) => setForm({ ...form, secondary: e.target.value })}
                  className="w-full rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                  {labels.tLabel}
                </label>
                <input
                  required
                  type="text"
                  value={form.tertiary}
                  onChange={(e) => setForm({ ...form, tertiary: e.target.value })}
                  className="w-full rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-neutral-200 dark:border-zinc-800 text-xs font-medium text-neutral-700 dark:text-neutral-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
