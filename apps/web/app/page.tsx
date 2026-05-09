import { redirect } from 'next/navigation'

export default function RootPage() {
  redirect('/shell?page=overview')
}
