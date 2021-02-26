export interface WSEvent<T = any> {
  action: string,
  data: T
}