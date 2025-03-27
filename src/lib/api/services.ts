import { supabase } from '@/integrations/supabase/client';
import { Service, SubService, Specialty, ServiceQuestion, QuestionOption, ServiceItem } from '@/lib/types';

// Cache for service data to improve performance
let servicesCache: Service[] | null = null;
let lastFetchTime = 0;
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

// Fetch all services with their sub-services and specialties
export async function getAllServices(): Promise<Service[]> {
  // Use cached data if available and recent
  const now = Date.now();
  if (servicesCache && now - lastFetchTime < CACHE_TTL) {
    console.log('Returning cached services data');
    return servicesCache;
  }

  try {
    console.log('Fetching services from database...');
    
    // Fetch all data in parallel for better performance
    const [servicesResult, subServicesResult, specialtiesResult] = await Promise.all([
      supabase.from('services').select('*').order('name'),
      supabase.from('sub_services').select('*').order('name'),
      supabase.from('specialties').select('*').order('name')
    ]);
    
    if (servicesResult.error) throw servicesResult.error;
    if (subServicesResult.error) throw subServicesResult.error;
    if (specialtiesResult.error) throw specialtiesResult.error;

    const servicesData = servicesResult.data;
    const allSubServices = subServicesResult.data;
    const allSpecialties = specialtiesResult.data;

    if (!servicesData || servicesData.length === 0) {
      console.log('No services found in database');
      return [];
    }

    console.log(`Found ${servicesData.length} services`);
    
    // Build the services structure
    const services: Service[] = servicesData.map(service => {
      // Filter subservices for this service
      const serviceSubServices = (allSubServices || [])
        .filter(subService => subService.service_id === service.id)
        .map(subService => {
          // Filter specialties for this subservice
          const subServiceSpecialties = (allSpecialties || [])
            .filter(specialty => specialty.sub_service_id === subService.id)
            .map(specialty => ({
              id: specialty.id,
              name: specialty.name,
              subServiceId: specialty.sub_service_id
            }));

          return {
            id: subService.id,
            name: subService.name,
            serviceId: subService.service_id,
            specialties: subServiceSpecialties
          };
        });

      return {
        id: service.id,
        name: service.name,
        subServices: serviceSubServices
      };
    });

    // Update cache
    servicesCache = services;
    lastFetchTime = now;
    console.log('Services fetched and cached successfully');
    
    return services;
  } catch (error) {
    console.error('Error fetching services:', error);
    // If there's an error, return cached data if available, otherwise empty array
    return servicesCache || [];
  }
}

// Clear the services cache
export function clearServicesCache() {
  servicesCache = null;
  lastFetchTime = 0;
  console.log('Services cache cleared');
}

// Get questions for a service, sub-service, or specialty
export async function getQuestions(
  serviceId?: string,
  subServiceId?: string,
  specialtyId?: string
): Promise<ServiceQuestion[]> {
  let query = supabase.from('service_questions').select('*');
  
  if (serviceId) {
    query = query.eq('service_id', serviceId);
  } else if (subServiceId) {
    query = query.eq('sub_service_id', subServiceId);
  } else if (specialtyId) {
    query = query.eq('specialty_id', specialtyId);
  } else {
    return [];
  }
  
  const { data: questionsData, error: questionsError } = await query;
  
  if (questionsError) {
    console.error('Error fetching questions:', questionsError);
    return [];
  }
  
  if (questionsData.length === 0) {
    return [];
  }
  
  // Get all question IDs
  const questionIds = questionsData.map(q => q.id);
  
  // Fetch all options in a single query
  const { data: allOptions, error: optionsError } = await supabase
    .from('question_options')
    .select('*')
    .in('question_id', questionIds);
  
  if (optionsError) {
    console.error('Error fetching question options:', optionsError);
    return [];
  }
  
  // Map questions with their options
  const questions: ServiceQuestion[] = questionsData.map(question => {
    const options: QuestionOption[] = allOptions
      .filter(option => option.question_id === question.id)
      .map(option => ({
        id: option.id,
        questionId: option.question_id,
        optionText: option.option_text
      }));
    
    return {
      id: question.id,
      question: question.question,
      serviceId: question.service_id,
      subServiceId: question.sub_service_id,
      specialtyId: question.specialty_id,
      options
    };
  });
  
  return questions;
}

// Get service items for a service, sub-service, or specialty
export async function getServiceItems(
  serviceId?: string,
  subServiceId?: string,
  specialtyId?: string
): Promise<ServiceItem[]> {
  let query = supabase.from('service_items').select('*');
  
  if (serviceId) {
    query = query.eq('service_id', serviceId);
  } else if (subServiceId) {
    query = query.eq('sub_service_id', subServiceId);
  } else if (specialtyId) {
    query = query.eq('specialty_id', specialtyId);
  } else {
    return [];
  }
  
  const { data, error } = await query;
  
  if (error) {
    console.error('Error fetching service items:', error);
    return [];
  }
  
  return data.map(item => ({
    id: item.id,
    name: item.name,
    type: item.type as "quantity" | "square_meter" | "linear_meter",
    serviceId: item.service_id,
    subServiceId: item.sub_service_id,
    specialtyId: item.specialty_id
  }));
}
