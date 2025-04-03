
import { supabase } from '@/integrations/supabase/client';
import { ProviderMatch, ProviderDetails, QuoteDetails, ProviderProfile, ProviderSpecialty } from '@/lib/types/providerMatch';
import { calculateDistance, geocodeAddress } from './googleMapsService';

// Função para encontrar prestadores que atendem aos critérios
export const findMatchingProviders = async (quoteDetails: QuoteDetails): Promise<ProviderMatch[]> => {
  try {
    if (!quoteDetails || !quoteDetails.serviceId) {
      console.error('Detalhes do orçamento inválidos:', quoteDetails);
      return [];
    }

    console.log('Iniciando busca de prestadores com detalhes:', {
      serviceId: quoteDetails.serviceId,
      serviceName: quoteDetails.serviceName,
      subServiceId: quoteDetails.subServiceId,
      subServiceName: quoteDetails.subServiceName,
      specialtyId: quoteDetails.specialtyId,
      specialtyName: quoteDetails.specialtyName
    });
    
    if (!quoteDetails.address) {
      console.error('Endereço não fornecido no orçamento');
      return [];
    }
    console.log('Endereço do cliente:', quoteDetails.address);

    console.log('Buscando prestadores disponíveis...');
    
    // Buscar todos os prestadores usando a função de segurança que evita a recursão
    const { data: allProviders, error: providersError } = await supabase
      .rpc('get_all_providers');
      
    if (providersError) {
      console.error('Erro ao buscar lista de prestadores:', providersError);
      return [];
    }
    
    console.log('Total de prestadores disponíveis:', allProviders?.length);
    
    // Vamos inspecionar todos os serviços cadastrados para debug
    console.log('Inspecionando todos os provider_services registrados:');
    const { data: allServices, error: allServicesError } = await supabase
      .from('provider_services')
      .select('*');
      
    if (allServicesError) {
      console.error('Erro ao buscar todos os serviços:', allServicesError);
    } else {
      console.log('Total de provider_services na tabela:', allServices?.length || 0);
      if (allServices && allServices.length > 0) {
        allServices.forEach(service => {
          console.log(`Provider ID: ${service.provider_id}, Specialty ID: ${service.specialty_id}, Base Price: ${service.base_price}`);
        });
      } else {
        console.log('Nenhum serviço cadastrado na tabela provider_services');
      }
    }
    
    // Buscar serviços prestados para a especialidade solicitada
    console.log(`Buscando serviços com specialty_id=${quoteDetails.specialtyId}`);
    const { data: specialtyServices, error: specialtyError } = await supabase
      .from('provider_services')
      .select('*')
      .eq('specialty_id', quoteDetails.specialtyId);
      
    if (specialtyError) {
      console.error('Erro ao buscar serviços para especialidade:', specialtyError);
      return [];
    }
    
    console.log('Serviços encontrados para a especialidade:', specialtyServices?.length || 0);
    
    // Se não encontrou para especialidade, tentar para o subserviço
    let matchingServices = specialtyServices || [];
    if (!matchingServices.length && quoteDetails.subServiceId) {
      console.log(`Buscando serviços com specialty_id=${quoteDetails.subServiceId} (subserviço)`);
      const { data: subServiceMatches, error: subServiceError } = await supabase
        .from('provider_services')
        .select('*')
        .eq('specialty_id', quoteDetails.subServiceId);
        
      if (subServiceError) {
        console.error('Erro ao buscar serviços para subserviço:', subServiceError);
      } else {
        console.log('Serviços encontrados para subserviço:', subServiceMatches?.length || 0);
        if (subServiceMatches && subServiceMatches.length > 0) {
          matchingServices = subServiceMatches;
        }
      }
    }
    
    // Se ainda não encontrou, tentar para o serviço principal
    if (!matchingServices.length && quoteDetails.serviceId) {
      console.log(`Buscando serviços com specialty_id=${quoteDetails.serviceId} (serviço principal)`);
      const { data: serviceMatches, error: serviceError } = await supabase
        .from('provider_services')
        .select('*')
        .eq('specialty_id', quoteDetails.serviceId);
        
      if (serviceError) {
        console.error('Erro ao buscar serviços para serviço principal:', serviceError);
      } else {
        console.log('Serviços encontrados para serviço principal:', serviceMatches?.length || 0);
        if (serviceMatches && serviceMatches.length > 0) {
          matchingServices = serviceMatches;
        }
      }
    }
    
    console.log('Total de serviços compatíveis encontrados:', matchingServices.length);
    
    // MODO EMERGÊNCIA: Se não encontrou nenhum serviço, mas temos prestadores, vamos criar um prestador virtual para debug
    const matchedProviders: ProviderMatch[] = [];
    
    if (!matchingServices.length && allProviders && allProviders.length > 0) {
      console.log('MODO EMERGÊNCIA: Exibindo prestadores disponíveis mesmo sem serviços correspondentes (para debug)');
      
      // Usar o primeiro prestador como exemplo
      for (const provider of allProviders) {
        try {
          console.log(`Processando prestador para debug: ${provider.name} (ID: ${provider.id})`);
          
          // Buscar settings do prestador
          const { data: settings } = await supabase
            .from('provider_settings')
            .select('*')
            .eq('provider_id', provider.id)
            .maybeSingle();
            
          // Geocodificar o endereço do cliente
          let distance = 5; // Valor padrão para modo debug
          let isWithinRadius = true; // Consideramos dentro do raio para debug
          
          // Criar providerProfile
          const providerProfile: ProviderProfile = {
            userId: provider.id,
            name: provider.name || 'Prestador',
            bio: settings?.bio || 'Prestador disponível para este serviço.',
            averageRating: 4.5, // Rating fictício para debug
            specialties: [],
            phone: provider.phone || '',
            city: settings?.city || 'São Paulo',
            neighborhood: settings?.neighborhood || 'Centro',
            relevanceScore: 3 // Alta relevância para debug
          };
          
          // Adicionar o prestador à lista
          matchedProviders.push({
            provider: providerProfile,
            distance,
            totalPrice: 100, // Preço fictício para debug
            isWithinRadius
          });
          
          console.log(`Prestador adicionado para debug: ${providerProfile.name}`);
        } catch (providerError) {
          console.error('Erro ao processar prestador para debug:', providerError);
        }
      }
    } else if (matchingServices.length > 0) {
      // Processamento normal se temos serviços
      // Lista de IDs de prestadores encontrados
      const providerIds = matchingServices.map(service => service.provider_id);
      console.log('IDs dos prestadores encontrados:', providerIds);
      
      // Filtrar prestadores pelo ID e criar um mapa para acesso rápido
      const providersMap = new Map();
      allProviders.forEach(provider => {
        if (providerIds.includes(provider.id)) {
          providersMap.set(provider.id, provider);
        }
      });
      
      console.log('Prestadores mapeados:', providersMap.size);
      
      // Buscar configurações dos prestadores
      const { data: providerSettings, error: settingsError } = await supabase
        .from('provider_settings')
        .select('*')
        .in('provider_id', providerIds);

      if (settingsError) {
        console.error('Erro ao buscar configurações dos prestadores:', settingsError);
      }
      
      console.log('Configurações dos prestadores:', providerSettings?.length || 0);
      
      // Criar mapa para configurações
      const settingsMap = new Map();
      if (providerSettings) {
        providerSettings.forEach(settings => {
          if (settings && settings.provider_id) {
            settingsMap.set(settings.provider_id, settings);
          }
        });
      }

      // Geocodificar o endereço do cliente
      let clientLocation = null;
      try {
        if (quoteDetails.address.street && quoteDetails.address.city) {
          const fullAddress = `${quoteDetails.address.street}, ${quoteDetails.address.number || ''}, ${quoteDetails.address.neighborhood || ''}, ${quoteDetails.address.city}, ${quoteDetails.address.state || ''}, ${quoteDetails.address.zipCode || ''}`;
          console.log('Geocodificando endereço do cliente:', fullAddress);
          
          clientLocation = await geocodeAddress(fullAddress);
          
          if (clientLocation) {
            console.log('Coordenadas do cliente:', clientLocation);
          } else {
            console.warn('Não foi possível geocodificar o endereço do cliente');
          }
        } else {
          console.warn('Endereço incompleto para geocodificação');
        }
      } catch (geoError) {
        console.error('Erro ao geocodificar endereço:', geoError);
      }
      
      // Processar cada serviço compatível
      for (const service of matchingServices) {
        try {
          const providerId = service.provider_id;
          const providerData = providersMap.get(providerId);
          
          if (!providerId || !providerData) {
            console.log('Serviço sem provider_id ou dados de prestador válidos');
            continue;
          }
          
          console.log('Processando prestador:', providerData.name, 'ID:', providerId);
          
          const settings = settingsMap.get(providerId);
          
          // Calcular relevância do prestador
          let relevanceScore = 1; // valor base
          
          if (quoteDetails.specialtyId && service.specialty_id === quoteDetails.specialtyId) {
            relevanceScore = 3; // Especialidade exata
            console.log('Match exato na especialidade:', quoteDetails.specialtyName);
          } else if (quoteDetails.subServiceId && service.specialty_id === quoteDetails.subServiceId) {
            relevanceScore = 2; // Sub-serviço 
            console.log('Match no subserviço:', quoteDetails.subServiceName);
          } else if (quoteDetails.serviceId && service.specialty_id === quoteDetails.serviceId) {
            relevanceScore = 1; // Apenas o serviço principal
            console.log('Match no serviço principal:', quoteDetails.serviceName);
          }
          
          // Calcular distância se possível
          let distance = 9999;
          let isWithinRadius = false;
          
          if (settings && settings.latitude && settings.longitude && clientLocation) {
            distance = calculateDistance(
              clientLocation.lat, 
              clientLocation.lng, 
              settings.latitude, 
              settings.longitude
            );
            
            const serviceRadius = settings?.service_radius_km || 0;
            isWithinRadius = serviceRadius === 0 || distance <= serviceRadius;
            
            console.log(`Prestador ${providerData.name}, distância: ${distance.toFixed(2)}km, raio: ${serviceRadius}km, dentro do raio: ${isWithinRadius}`);
          } else {
            console.log(`Prestador ${providerData.name} não possui coordenadas ou configuração de raio`);
            // Se o prestador não tem localização configurada, considerar que ele atende todo o Brasil
            isWithinRadius = true;
            distance = 0;
          }
          
          // Calcular preço básico para o serviço
          let totalPrice = service.base_price || 0;
          
          // Simular avaliação do prestador
          let averageRating = Math.random() * 3 + 2; // Entre 2 e 5 estrelas
          if (Math.random() > 0.8) {
            averageRating = 0; // 20% dos prestadores são novos sem avaliação
          }
          
          // Criar objeto ProviderProfile
          const provider: ProviderProfile = {
            userId: providerId,
            bio: settings?.bio || '',
            averageRating: averageRating,
            specialties: [], // Será preenchido se necessário
            name: providerData.name || 'Sem nome',
            phone: providerData.phone || '',
            city: settings?.city || '',
            neighborhood: settings?.neighborhood || '',
            relevanceScore: relevanceScore
          };
          
          // Adicionar à lista de prestadores compatíveis
          matchedProviders.push({
            provider,
            distance,
            totalPrice,
            isWithinRadius
          });
          
          console.log(`Prestador adicionado: ${provider.name}`);
        } catch (providerError) {
          console.error('Erro ao processar prestador:', providerError);
        }
      }
    }

    console.log(`Encontrados ${matchedProviders.length} prestadores compatíveis no total`);

    // Ordenar: primeiro os que estão dentro do raio e por relevância, depois os outros
    matchedProviders.sort((a, b) => {
      // Primeiro ordenar por "está no raio"
      if (a.isWithinRadius && !b.isWithinRadius) return -1;
      if (!a.isWithinRadius && b.isWithinRadius) return 1;
      
      // Se ambos estão no mesmo grupo, ordenar por relevância
      const relevanceA = a.provider.relevanceScore || 0;
      const relevanceB = b.provider.relevanceScore || 0;
      
      if (relevanceA !== relevanceB) {
        return relevanceB - relevanceA; // Maior relevância primeiro
      }
      
      // Se mesma relevância, ordenar por distância
      return a.distance - b.distance;
    });

    console.log(`Retornando ${matchedProviders.length} prestadores, ${matchedProviders.filter(p => p.isWithinRadius).length} dentro do raio`);
    return matchedProviders;
  } catch (error) {
    console.error('Erro ao buscar prestadores correspondentes:', error);
    return []; // Retornar array vazio em caso de erro para evitar quebra da UI
  }
};

// Função para obter detalhes completos de um prestador
export const getProviderDetails = async (providerId: string): Promise<ProviderDetails | null> => {
  try {
    // Usar a função de segurança para obter o prestador específico
    const { data: allProviders, error: providersError } = await supabase
      .rpc('get_all_providers');

    if (providersError) {
      console.error('Erro ao buscar prestadores:', providersError);
      return null;
    }
    
    // Encontrar o prestador específico
    const provider = allProviders.find(p => p.id === providerId);
    
    if (!provider) {
      console.error('Prestador não encontrado:', providerId);
      return null;
    }

    // Get provider settings separately
    const { data: settings, error: settingsError } = await supabase
      .from('provider_settings')
      .select('*')
      .eq('provider_id', providerId)
      .maybeSingle();

    if (settingsError) {
      console.error('Erro ao buscar configurações do prestador:', settingsError);
    }

    // Buscar portfólio do prestador
    const { data: portfolio, error: portfolioError } = await supabase
      .from('provider_portfolio')
      .select('id, image_url, description')
      .eq('provider_id', providerId);

    if (portfolioError) {
      console.error('Erro ao buscar portfólio:', portfolioError);
    }

    // Criar explicitamente um objeto ProviderProfile para evitar problemas de tipagem
    const providerProfile: ProviderProfile = {
      userId: provider.id,
      name: provider.name,
      phone: provider.phone,
      bio: settings?.bio || '',
      averageRating: 4.0, // Valor fictício para exemplo
      specialties: [], // Array vazio inicial
      city: settings?.city || '',
      neighborhood: settings?.neighborhood || ''
    };

    return {
      provider: providerProfile,
      portfolioItems: portfolio ? portfolio.map((item) => ({
        id: item.id,
        imageUrl: item.image_url,
        description: item.description
      })) : [],
      distance: 0, // Será calculado quando necessário
      totalPrice: 0, // Será calculado quando necessário
      rating: 4.0, // Valor fictício para exemplo
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
    // Se não tivermos um quote ID existente, precisamos criá-lo
    if (!quoteDetails.id) {
      return { success: false, message: 'ID do orçamento não fornecido', requiresLogin: false };
    }

    // Associar o orçamento ao prestador
    const { error: providerQuoteError } = await supabase
      .from('quote_providers')
      .insert({
        quote_id: quoteDetails.id,
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
      quoteId: quoteDetails.id 
    };
  } catch (error) {
    console.error('Erro ao enviar orçamento:', error);
    return { success: false, message: 'Erro ao processar orçamento' };
  }
};
