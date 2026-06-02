import { cn } from '../../lib/cn';
import { NewsFilters, NewsTagOptions } from '@comp-intel/shared/types/news';

interface NewsFilterBarProps {
  tagOptions: NewsTagOptions;
  filters: NewsFilters;
  onChange: (filters: NewsFilters) => void;
}

interface FilterSection {
  key: keyof NewsFilters;
  label: string;
  options: string[];
}

export function NewsFilterBar({ tagOptions, filters, onChange }: NewsFilterBarProps) {
  const sections: FilterSection[] = [
    { key: 'commodity', label: 'Commodity', options: tagOptions.commodities },
    { key: 'topic', label: 'Topic', options: tagOptions.topics },
    { key: 'geography', label: 'Region', options: tagOptions.geographies },
    { key: 'sentiment', label: 'Sentiment', options: tagOptions.sentiments },
    { key: 'source', label: 'Source', options: tagOptions.sources.map(s => s.charAt(0).toUpperCase() + s.slice(1)) },
  ];

  const handleToggle = (key: keyof NewsFilters, value: string) => {
    // For source, convert display name back to lowercase API value
    const apiValue = key === 'source' ? value.toLowerCase() : value;
    onChange({
      ...filters,
      [key]: filters[key] === apiValue ? null : apiValue,
    });
  };

  const hasActiveFilters = Object.values(filters).some(v => v !== null);

  return (
    <div className="space-y-2">
      {/* Scrollable chip rows */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1" style={{ WebkitOverflowScrolling: 'touch' }}>
        {hasActiveFilters && (
          <button
            onClick={() => onChange({ commodity: null, topic: null, geography: null, sentiment: null, source: null })}
            className={cn(
              "shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
              "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300",
            )}
          >
            Clear all
          </button>
        )}
        {sections.map(section =>
          section.options.map(option => {
            const apiValue = section.key === 'source' ? option.toLowerCase() : option;
            const isActive = filters[section.key] === apiValue;
            return (
              <button
                key={`${section.key}-${option}`}
                onClick={() => handleToggle(section.key, option)}
                className={cn(
                  "shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700",
                )}
              >
                {option}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
