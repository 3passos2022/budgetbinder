
import { supabase } from '@/integrations/supabase/client';
import { ProviderMatch, ProviderDetails, QuoteDetails } from '@/lib/types/providerMatch';
import { calculateDistance, geocodeAddress } from './googleMapsService';
import { Specialty, ServiceItem } from '@/lib/types';

// Função para encontrar prestadores que atendem aos critérios
export const findMatchingProviders = async (quoteDetails: QuoteDetails): Promise<ProviderMatch[]> => {
  try {
    // 1. Encontrar prestadores que oferecem o serviço específico
    const { data: providerServices, error: servicesError } = await supabase
      .from('provider_services')
      .select(`
        id, 
        base_price,
        provider_id,
        specialty_id,
        profiles!provider_id (
          id, 
          name, 
          phone
        ),
        provider_settings!provider_id (
          service_radius_km,
          latitude,
          longitude,
          bio
        )
      `)
      .eq('specialty_id', quoteDetails.specialtyId);

    if (servicesError) {
      console.error('Erro ao buscar serviços dos prestadores:', servicesError);
      return [];
    }

    if (!providerServices || providerServices.length === 0) {
      console.log('Nenhum prestador encontrado para esta especialidade');
      return [];
    }

    // 2. Geocodificar o endereço do cliente
    const fullAddress = `${quoteDetails.address.street}, ${quoteDetails.address.number}, ${quoteDetails.address.neighborhood}, ${quoteDetails.address.city}, ${quoteDetails.address.state}, ${quoteDetails.address.zipCode}`;
    const clientLocation = await geocodeAddress(fullAddress);

    if (!clientLocation) {
      console.error('Não foi possível geocodificar o endereço do cliente');
      return [];
    }

    // 3. Buscar itens e medições para calcular preço
    let totalItems: any[] = [];
    
    if (quoteDetails.items && Object.keys(quoteDetails.items).length > 0) {
      // Buscar preços específicos de itens que os prestadores oferecem
      const { data: itemPrices, error: itemsError } = await supabase
        .from('provider_item_prices')
        .select('*')
        .in('provider_id', providerServices.map(ps => ps.provider_id))
        .in('item_id', Object.keys(quoteDetails.items));
        
      if (itemsError) {
        console.error('Erro ao buscar preços de itens:', itemsError);
      } else {
        totalItems = itemPrices || [];
      }
    }

    // 4. Calcular distâncias e preços para cada prestador
    const providers: ProviderMatch[] = providerServices.map(ps => {
      // Se o prestador não tem coordenadas ou raio de serviço definido, assumir valores padrão
      const settings = ps.provider_settings || { service_radius_km: 10, latitude: null, longitude: null, bio: '' };
      const providerLat = settings?.latitude;
      const providerLng = settings?.longitude;
      
      // Calcular distância se possível
      let distance = 9999;
      let isWithinRadius = false;
      
      if (providerLat && providerLng && clientLocation) {
        distance = calculateDistance(
          clientLocation.lat, 
          clientLocation.lng, 
          providerLat, 
          providerLng
        );
        isWithinRadius = distance <= (settings?.service_radius_km || 10);
      }
      
      // Calcular preço básico para o serviço
      let totalPrice = ps.base_price || 0;
      
      // Adicionar preços de itens específicos
      if (quoteDetails.items && Object.keys(quoteDetails.items).length > 0) {
        Object.entries(quoteDetails.items).forEach(([itemId, quantity]) => {
          // Encontrar o preço específico do prestador para este item
          const itemPrice = totalItems.find(
            ip => ip.provider_id === ps.provider_id && ip.item_id === itemId
          );
          
          if (itemPrice) {
            totalPrice += (itemPrice.price_per_unit * quantity);
          } else {
            // Usar preço padrão se o prestador não tiver um preço específico
            totalPrice += ps.base_price * quantity;
          }
        });
      }
      
      // Adicionar preços por medições (metros quadrados/lineares)
      if (quoteDetails.measurements && quoteDetails.measurements.length > 0) {
        quoteDetails.measurements.forEach(measurement => {
          // Calcular área ou comprimento
          const area = measurement.area || (measurement.width * measurement.length);
          totalPrice += ps.base_price * area;
        });
      }
      
      return {
        provider: {
          userId: ps.profiles.id,
          bio: settings?.bio || '',
          averageRating: 0, // Será preenchido posteriormente
          specialties: [],
          name: ps.profiles.name,
          phone: ps.profiles.phone,
          city: '', // Será preenchido posteriormente
          neighborhood: '' // Será preenchido posteriormente
        },
        distance,
        totalPrice,
        isWithinRadius
      };
    });

    // 5. Buscar dados adicionais dos prestadores (localização e avaliações)
    for (const provider of providers) {
      // Buscar localização com base no ID do usuário
      if (provider.provider.userId) {
        const { data: address } = await supabase
          .from('provider_settings')
          .select('*')
          .eq('provider_id', provider.provider.userId)
          .single();
        
        if (address) {
          provider.provider.city = address?.city || '';
          provider.provider.neighborhood = address?.neighborhood || '';
        }
      }
      
      // Buscar avaliação média
      const { data: ratings } = await supabase
        .from('quotes')
        .select('rating')
        .eq('provider_id', provider.provider.userId)
        .not('rating', 'is', null);
      
      if (ratings && ratings.length > 0) {
        const validRatings = ratings.filter(r => r.rating !== null && r.rating !== undefined);
        if (validRatings.length > 0) {
          const sum = validRatings.reduce((acc, curr) => acc + (curr.rating || 0), 0);
          provider.provider.averageRating = sum / validRatings.length;
        }
      }
    }

    // Ordenar: primeiro os que estão dentro do raio, depois os outros
    providers.sort((a, b) => {
      // Primeiro ordenar por "está no raio"
      if (a.isWithinRadius && !b.isWithinRadius) return -1;
      if (!a.isWithinRadius && b.isWithinRadius) return 1;
      
      // Se ambos estão no mesmo grupo, ordenar por distância
      return a.distance - b.distance;
    });

    return providers;
  } catch (error) {
    console.error('Erro ao buscar prestadores correspondentes:', error);
    return [];
  }
};

// Função para obter detalhes completos de um prestador
export const getProviderDetails = async (providerId: string): Promise<ProviderDetails | null> => {
  try {
    // 1. Buscar informações básicas do prestador
    const { data: provider, error: providerError } = await supabase
      .from('profiles')
      .select(`
        id,
        name,
        phone,
        provider_settings!provider_id (
          bio,
          service_radius_km,
          latitude,
          longitude,
          city,
          neighborhood
        )
      `)
      .eq('id', providerId)
      .single();

    if (providerError || !provider) {
      console.error('Erro ao buscar detalhes do prestador:', providerError);
      return null;
    }

    // 2. Buscar portfólio do prestador
    const { data: portfolio, error: portfolioError } = await supabase
      .from('provider_portfolio')
      .select('id, image_url, description')
      .eq('provider_id', providerId);

    if (portfolioError) {
      console.error('Erro ao buscar portfólio:', portfolioError);
    }

    // 3. Buscar avaliações do prestador
    const { data: ratings } = await supabase
      .from('quotes')
      .select('rating')
      .eq('provider_id', providerId)
      .not('rating', 'is', null);

    let averageRating = 0;
    if (ratings && ratings.length > 0) {
      const validRatings = ratings.filter(r => r.rating !== null && r.rating !== undefined);
      if (validRatings.length > 0) {
        const sum = validRatings.reduce((acc, curr) => acc + (curr.rating || 0), 0);
        averageRating = sum / validRatings.length;
      }
    }

    const settings = provider.provider_settings || {};

    return {
      provider: {
        userId: provider.id,
        name: provider.name,
        phone: provider.phone,
        bio: settings.bio || '',
        averageRating,
        specialties: [],
        city: settings.city || '',
        neighborhood: settings.neighborhood || ''
      },
      portfolioItems: portfolio ? portfolio.map(item => ({
        id: item.id,
        imageUrl: item.image_url,
        description: item.description
      })) : [],
      distance: 0, // Será calculado quando necessário
      totalPrice: 0, // Será calculado quando necessário
      rating: averageRating,
      isWithinRadius: false // Será calculado quando necessário
    };
  } catch (error) {
    console.error('Erro ao buscar detalhes completos do prestador:', error);
    return null;
  }
};

// Função para enviar orçamento para um prestador
export const sendQuoteToProvider = async (
  quoteDetails: QuoteDetails, 
  providerId: string
): Promise<{ success: boolean; message: string; quoteId?: string; requiresLogin?: boolean }> => {
  try {
    // Verificar se o usuário está autenticado
    if (!quoteDetails.clientId) {
      console.log('Client ID not provided, login required');
      return { success: false, message: 'Login necessário', requiresLogin: true };
    }

    // Usar o quoteId existente se já tivermos criado anteriormente
    const quoteId = quoteDetails.quoteId || '';
    
    // 1. Se não tivermos um quote ID existente, precisamos criá-lo
    if (!quoteId) {
      return { success: false, message: 'ID do orçamento não fornecido', requiresLogin: true };
    }

    // 2. Associar o orçamento ao prestador
    const { error: providerQuoteError } = await supabase
      .from('quote_providers')
      .insert({
        quote_id: quoteId,
        provider_id: providerId,
        status: 'pending'
      });

    if (providerQuoteError) {
      console.error('Erro ao associar orçamento ao prestador:', providerQuoteError);
      return { success: false, message: 'Erro ao enviar orçamento ao prestador' };
    }

    return { 
      success: true, 
      message: 'Orçamento enviado com sucesso', 
      quoteId: quoteId 
    };
  } catch (error) {
    console.error('Erro ao enviar orçamento:', error);
    return { success: false, message: 'Erro ao processar orçamento' };
  }
};
