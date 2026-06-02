import type { UserMessage as UserMessageType } from '../../../types/goldie'

export function UserMessage({ message }: { message: UserMessageType }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-2xl rounded-br-md px-4 py-2.5 bg-primary text-primary-foreground text-sm leading-relaxed">
        {message.content}
      </div>
    </div>
  )
}
