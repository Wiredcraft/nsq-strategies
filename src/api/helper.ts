import axios, { AxiosInstance } from 'axios';

export function createAxiosInstance(options: { baseUrl: string } | string): AxiosInstance {
  if (typeof options !== 'object') {
    options = { baseUrl: options };
  }
  if (typeof options.baseUrl !== 'string' || options.baseUrl.length === 0) {
    throw new Error('A base URL is required');
  }
  return axios.create({
    baseURL: options.baseUrl.replace(/(\/+)$/, ''),
  });
}
