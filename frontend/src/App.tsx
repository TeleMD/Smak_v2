import { useState, useEffect } from 'react'
import { User } from '@supabase/supabase-js'
import { supabase } from './utils/supabase'
import AuthSection from './components/AuthSection'
import Header from './components/Header'
import Dashboard from './pages/Dashboard'
import { UserProfile } from './types'

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        loadUserProfile(session.user.id)
      } else {
        setLoading(false)
      }
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        loadUserProfile(session.user.id)
      } else {
        setUserProfile(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const loadUserProfile = async (userId: string) => {
    try {
      // First check if user profile exists
      const { data: profile, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading user profile:', error)
        setLoading(false)
        return
      }

      if (!profile) {
        // Create user profile if it doesn't exist
        const user = await supabase.auth.getUser()
        if (user.data.user) {
          const { error: insertError } = await supabase
            .from('user_profiles')
            .insert([{
              user_id: userId,
              email: user.data.user.email,
              approval_status: 'pending',
              is_admin: false
            }])

          if (insertError) {
            console.error('Error creating user profile:', insertError)
          }

          setUserProfile({
            approval_status: 'pending',
            is_admin: false
          })
        }
      } else {
        setUserProfile(profile)
      }
    } catch (error) {
      console.error('Error in loadUserProfile:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading Smak v2...</p>
        </div>
      </div>
    )
  }

  // Show auth screen if not logged in
  if (!user) {
    return <AuthSection />
  }

  // Show approval pending message
  if (userProfile?.approval_status === 'pending') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-yellow-100">
                <svg className="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h3 className="mt-4 text-lg font-medium text-gray-900">Account Pending Approval</h3>
              <p className="mt-2 text-sm text-gray-600">
                Your account has been created but is pending admin approval. Please contact your administrator to gain access to Smak v2.
              </p>
              <div className="mt-6">
                <button
                  onClick={() => supabase.auth.signOut()}
                  className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Show rejection message
  if (userProfile?.approval_status === 'rejected') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
                <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h3 className="mt-4 text-lg font-medium text-gray-900">Access Denied</h3>
              <p className="mt-2 text-sm text-gray-600">
                Your account access has been denied. Please contact your administrator for more information.
              </p>
              {userProfile.rejected_reason && (
                <p className="mt-2 text-sm text-red-600">
                  Reason: {userProfile.rejected_reason}
                </p>
              )}
              <div className="mt-6">
                <button
                  onClick={() => supabase.auth.signOut()}
                  className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Show main application for approved users
  return (
    <div className="min-h-screen bg-gray-50">
      <Header user={user} />
      <main>
        <Dashboard />
      </main>
    </div>
  )
}

export default App 