
import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { RoleUtils } from '@/lib/utils/RoleUtils';
import ProfileImageEditor from './ProfileImageEditor';
import ProviderRating from './ProviderRating';

const UserProfile: React.FC = () => {
  const { user, updateProfile } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [loading, setLoading] = useState(false);
  const [isImageEditorOpen, setIsImageEditorOpen] = useState(false);
  
  const handleUpdate = async () => {
    setLoading(true);
    try {
      const { error } = await updateProfile({
        name,
        phone
      });
      
      if (error) {
        throw error;
      }
      
      toast.success('Perfil atualizado com sucesso');
      setIsEditing(false);
    } catch (error) {
      toast.error('Erro ao atualizar perfil');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setName(user?.name || '');
    setPhone(user?.phone || '');
    setIsEditing(false);
  };
  
  const handleSaveImage = async (imageData: string) => {
    setLoading(true);
    try {
      const { error } = await updateProfile({
        avatar_url: imageData
      });
      
      if (error) {
        throw error;
      }
    } catch (error) {
      toast.error('Erro ao atualizar foto de perfil');
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  const getInitials = () => {
    if (user.name) {
      return user.name
        .split(' ')
        .map(part => part[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();
    }
    return user.email.substring(0, 2).toUpperCase();
  };

  const isProvider = RoleUtils.isProvider(user);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
        <h2 className="text-2xl font-bold tracking-tight">Minhas Informações</h2>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center gap-4">
          <div className="relative group cursor-pointer" onClick={() => setIsImageEditorOpen(true)}>
            <Avatar className="h-16 w-16">
              <AvatarImage src={user.avatar_url} alt={user.name || 'Avatar'} />
              <AvatarFallback className="text-lg">{getInitials()}</AvatarFallback>
            </Avatar>
            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 rounded-full flex items-center justify-center transition-all duration-200">
              <span className="text-white opacity-0 group-hover:opacity-100 text-xs font-medium">
                Editar
              </span>
            </div>
          </div>
          <div className="flex-1">
            <CardTitle>{user.name || 'Usuário'}</CardTitle>
            <CardDescription>{user.email}</CardDescription>
            {isProvider && (
              <div className="mt-2">
                <ProviderRating providerId={user.id} />
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isEditing ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Seu nome completo"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="phone">Telefone</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(00) 00000-0000"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Nome</p>
                <p className="font-medium">{user.name || 'Não informado'}</p>
              </div>
              
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">E-mail</p>
                <p className="font-medium">{user.email}</p>
              </div>
              
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Telefone</p>
                <p className="font-medium">{user.phone || 'Não informado'}</p>
              </div>
              
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Tipo de conta</p>
                <p className="font-medium">{RoleUtils.getAccountTypeLabel(user)}</p>
              </div>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-end space-x-2">
          {isEditing ? (
            <>
              <Button variant="outline" onClick={handleCancel} disabled={loading}>
                Cancelar
              </Button>
              <Button onClick={handleUpdate} disabled={loading}>
                {loading ? 'Salvando...' : 'Salvar alterações'}
              </Button>
            </>
          ) : (
            <Button onClick={() => setIsEditing(true)}>Editar perfil</Button>
          )}
        </CardFooter>
      </Card>
      
      <ProfileImageEditor
        open={isImageEditorOpen}
        onClose={() => setIsImageEditorOpen(false)}
        onSave={handleSaveImage}
        initialImage={user.avatar_url}
      />
    </div>
  );
};

export default UserProfile;
