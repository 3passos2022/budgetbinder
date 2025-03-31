
// This file is automatically generated. Do not edit it directly.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = "https://jezfwtknzraaykkjjaaf.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImplemZ3dGtuenJhYXlra2pqYWFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDI5MDEyODgsImV4cCI6MjA1ODQ3NzI4OH0.KQi-SMdeDN7gMpWufxctNwoqkHEtDgKEQE0LRbifGsc";

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImplemZ3dGtuenJhYXlra2pqYWFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDI5MDEyODgsImV4cCI6MjA1ODQ3NzI4OH0.KQi-SMdeDN7gMpWufxctNwoqkHEtDgKEQE0LRbifGsc", {
  auth: {
    persistSession: true,
    storageKey: '3passos-auth',
    storage: typeof window !== 'undefined' ? localStorage : undefined,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
  global: {
    headers: {
      'x-application-name': '3passos'
    }
  },
  db: {
    schema: 'public'
  }
});

// Set site URL for Supabase redirects
if (typeof window !== 'undefined') {
  // Set site URL to support proper redirection
  const redirectUrls = ['https://3passos.com.br', 'https://3passos.com'];
  
  // Get existing session from storage
  const existingToken = localStorage.getItem('sb-jezfwtknzraaykkjjaaf-auth-token');
  const existingRefreshToken = localStorage.getItem('sb-jezfwtknzraaykkjjaaf-auth-refresh-token');
  
  if (existingToken && existingRefreshToken) {
    try {
      const parsedToken = JSON.parse(existingToken);
      const parsedRefreshToken = JSON.parse(existingRefreshToken);
      
      // Use setSession in newer versions of Supabase instead of setAuth
      supabase.auth.setSession({
        access_token: parsedToken,
        refresh_token: parsedRefreshToken,
      }).catch(err => {
        console.error('Error setting session:', err);
      });
    } catch (error) {
      console.error('Error parsing stored tokens:', error);
    }
  }
}
