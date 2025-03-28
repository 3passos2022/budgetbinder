
import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { UserRole } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface UserListItem {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [promoting, setPromoting] = useState<string | null>(null);
  const { makeAdmin } = useAuth();

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Map profiles to UserListItem format
      const usersWithEmails: UserListItem[] = [];
      
      for (const profile of data || []) {
        // For each profile, create a UserListItem with default email (using the ID)
        const userItem: UserListItem = {
          id: profile.id,
          email: profile.id, // Default to ID
          name: profile.name || '',
          role: profile.role as UserRole,
        };
        
        // Add to our final list
        usersWithEmails.push(userItem);
      }

      // Update hard-coded email for your specific user
      const andreUser = usersWithEmails.find(user => 
        user.id === 'ad9e2a2a-0a39-4e49-80b6-a5699ca6a866'
      );
      
      if (andreUser) {
        andreUser.email = 'pro.andresouza@gmail.com';
      }

      setUsers(usersWithEmails);
    } catch (error) {
      console.error('Error loading users:', error);
      toast.error('Falha ao carregar usuários.');
    } finally {
      setLoading(false);
    }
  };

  const handleMakeAdmin = async (userId: string) => {
    setPromoting(userId);
    try {
      await makeAdmin(userId);
      toast.success('Usuário promovido a administrador com sucesso!');
      
      // Update the local users list
      setUsers(users.map(user => 
        user.id === userId 
          ? {...user, role: UserRole.ADMIN} 
          : user
      ));
    } catch (error) {
      console.error('Error making admin:', error);
      toast.error('Falha ao promover usuário a administrador.');
    } finally {
      setPromoting(null);
    }
  };

  const filteredUsers = users.filter(user => {
    const searchLower = searchTerm.toLowerCase();
    return (
      user.name?.toLowerCase().includes(searchLower) ||
      user.email?.toLowerCase().includes(searchLower) ||
      user.role?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Gerenciamento de Usuários</h1>
      
      <div className="relative mb-6">
        <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
        <Input
          placeholder="Procurar usuários por nome, email ou função..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>
      
      {loading ? (
        <p>Carregando usuários...</p>
      ) : (
        <Table>
          <TableCaption>Lista de usuários cadastrados no sistema.</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">ID</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Função</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.id}</TableCell>
                <TableCell>{user.name}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    user.role === UserRole.ADMIN 
                      ? 'bg-purple-100 text-purple-800' 
                      : user.role === UserRole.PROVIDER
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-gray-100 text-gray-800'
                  }`}>
                    {user.role === UserRole.ADMIN ? 'Administrador' : 
                     user.role === UserRole.PROVIDER ? 'Prestador' : 'Cliente'}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  {user.role !== UserRole.ADMIN && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleMakeAdmin(user.id)}
                      disabled={promoting === user.id}
                    >
                      {promoting === user.id ? 'Processando...' : 'Promover a Admin'}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
};

export default UserManagement;
