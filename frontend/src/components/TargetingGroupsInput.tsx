import { TargetingAttribute } from '../lib/game-utils';

interface Props {
  attributes: TargetingAttribute[];
  targeting: Set<number>;
  onChange: (next: Set<number>) => void;
}

export function TargetingGroupsInput({ attributes, targeting, onChange }: Props) {
  if (attributes.length === 0) return null;

  const toggleAll = (attr: TargetingAttribute, checked: boolean) => {
    const next = new Set(targeting);
    attr.values.forEach((v) => (checked ? next.add(v.id) : next.delete(v.id)));
    onChange(next);
  };

  const toggleValue = (id: number, checked: boolean) => {
    const next = new Set(targeting);
    checked ? next.add(id) : next.delete(id);
    onChange(next);
  };

  return (
    <div className="space-y-1.5 pt-1 border-t border-slate-100">
      <p className="text-xs font-medium text-slate-500">
        Targeting <span className="font-normal text-slate-400">(leave blank to apply to everyone)</span>
      </p>
      {attributes.map((attr) => {
        const allChecked = attr.values.length > 0 && attr.values.every((v) => targeting.has(v.id));
        return (
          <div key={attr.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="font-medium text-slate-600 w-36 shrink-0">{attr.name}</span>
            <label className="flex items-center gap-1 text-slate-400 italic cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allChecked}
                onChange={(e) => toggleAll(attr, e.target.checked)}
              />
              All
            </label>
            {attr.values.map((v) => (
              <label key={v.id} className="flex items-center gap-1 cursor-pointer select-none text-slate-700">
                <input
                  type="checkbox"
                  checked={targeting.has(v.id)}
                  onChange={(e) => toggleValue(v.id, e.target.checked)}
                />
                {v.label}
                {v.description && (
                  <span className="text-slate-400 text-[10px]">({v.description})</span>
                )}
              </label>
            ))}
          </div>
        );
      })}
    </div>
  );
}
