import { useState, useMemo } from 'react';
import * as Select from '@radix-ui/react-select';
import * as Label from '@radix-ui/react-label';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface SelectOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  id: string;
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}

export function SearchableSelect({
  id,
  label,
  value,
  options,
  onChange,
  placeholder,
  required = false,
  disabled = false,
}: SearchableSelectProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const placeholderText = placeholder ?? t('searchableSelect.placeholder');

  // 过滤选项
  const filteredOptions = useMemo(() => {
    if (!search) return options;
    const lowerSearch = search.toLowerCase();
    return options.filter(opt => 
      opt.label.toLowerCase().includes(lowerSearch) || 
      opt.value.toLowerCase().includes(lowerSearch)
    );
  }, [options, search]);

  // 获取当前选中项的标签
  const selectedLabel = useMemo(() => {
    const selected = options.find(opt => opt.value === value);
    return selected?.label || placeholderText;
  }, [options, value, placeholderText]);

  const isPlaceholder = !value;

  return (
    <div className="space-y-2">
      <Label.Root htmlFor={id} className="text-sm font-medium text-secondary">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </Label.Root>
      
      <Select.Root 
        value={value} 
        onValueChange={onChange}
        open={open}
        onOpenChange={(isOpen) => {
          setOpen(isOpen);
          if (!isOpen) setSearch(''); // 关闭时清空搜索
        }}
        disabled={disabled}
      >
        <Select.Trigger
          id={id}
          className="flex w-full items-center justify-between rounded-md border border-default bg-surface px-3 py-2 text-left text-default focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:bg-muted"
        >
          <Select.Value asChild>
            <span className={isPlaceholder ? 'text-muted' : undefined}>{selectedLabel}</span>
          </Select.Value>
          <Select.Icon className="ml-2">
            <ChevronDown size={16} className="text-muted" />
          </Select.Icon>
        </Select.Trigger>

        <Select.Portal>
          <Select.Content
            className="bg-surface rounded-md shadow-lg border border-default overflow-hidden"
            position="popper"
            sideOffset={4}
            style={{ width: 'var(--radix-select-trigger-width)', maxHeight: '300px' }}
          >
            {/* 搜索框 */}
            <div className="p-2 border-b border-default sticky top-0 bg-surface z-10">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('searchableSelect.searchPlaceholder')}
                className="w-full rounded border border-default bg-surface px-2 py-1 text-sm text-default focus:outline-none focus:ring-1 focus:ring-primary"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>

            <Select.Viewport className="p-1 overflow-y-auto" style={{ maxHeight: '250px' }}>
              {filteredOptions.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted text-center">
                  {t('searchableSelect.noMatch')}
                </div>
              ) : (
                filteredOptions.map((option) => (
                  <Select.Item
                    key={option.value}
                    value={option.value}
                    className="select-item px-3 py-2 text-sm cursor-pointer outline-none rounded"
                  >
                    <Select.ItemText>{option.label}</Select.ItemText>
                  </Select.Item>
                ))
              )}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}
