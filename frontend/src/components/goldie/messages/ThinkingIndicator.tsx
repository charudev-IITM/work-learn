export function ThinkingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="flex-shrink-0 w-7 h-7 mr-2" />
      <div className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-muted/60">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  )
}
