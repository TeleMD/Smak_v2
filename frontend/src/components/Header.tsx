import { supabase } from '../utils/supabase'
import { LogOut, ShoppingCart, User } from 'lucide-react'

interface HeaderProps {
  user: any
}

export default function Header({ user }: HeaderProps) {
  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-3">
            <div className="bg-primary-600 p-2 rounded-lg">
              <ShoppingCart className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Smak v2</h1>
              <p className="text-xs text-gray-500">Advanced Inventory Management</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <User className="h-5 w-5 text-gray-400" />
              <span className="text-sm text-gray-700">{user?.email}</span>
            </div>
            
            <button
              onClick={handleSignOut}
              className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign out
            </button>
          </div>
        </div>
      </div>
    </header>
  )
} 