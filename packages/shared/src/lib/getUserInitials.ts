export function getUserInitials(user: { name?: string; username: string }): string {
  if (user.name) {
    const parts = user.name.trim().split(' ')
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    return parts[0].slice(0, 2).toUpperCase()
  }
  return user.username.slice(0, 2).toUpperCase()
}
