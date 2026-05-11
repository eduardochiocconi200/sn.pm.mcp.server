// Query Constants Factory
// This factory provides version-specific query constants based on ServiceNow instance conditions

import * as AustraliaQueries from './versions/australia/query_constants.js';
import * as ZurichQueries from './versions/zurich/query_constants.js';
import * as BrazilQueries from './versions/brazil/query_constants.js';

export interface QueryConstants {
  QUERY_LIST_PROJECTS: string;
  QUERY_GET_PROJECT_DETAILS: string;
  QUERY_LIST_FILTERS: string;
  QUERY_CREATE_TRANSITION_FILTER: string;
  QUERY_CREATE_RULE_BASED_FILTER: string;
  QUERY_CREATE_BREAKDOWN_FILTER: string;
  QUERY_MINE_PROJECT: string;
  QUERY_CLUSTER_NODE: string;
  QUERY_DELETE_FILTERS: string;
  QUERY_GET_FILTER_DETAILS: string;
  QUERY_GET_VARIANTS: string;
  QUERY_GET_BREAKDOWNS: string;
  QUERY_CREATE_VARIANT_FILTER: string;
  QUERY_GET_SCHEDULED_TASKS: string;
  QUERY_SHOW_RECORDS: string;
  QUERY_TRANSITION_WORK_NOTES_ANALYSIS: string;
  QUERY_INTENT_AND_ACTIVITY_ANALYSIS: string;
}

export type ServiceNowVersion = 'australia' | 'zurich' | 'brazil' ;

export class QueryConstantsFactory {
  private static instances: Map<ServiceNowVersion, QueryConstants> = new Map();
  
  /**
   * Get query constants based on ServiceNow version
   * @param version - ServiceNow version/flavor
   * @returns QueryConstants object with version-specific queries
   */
  static getQueries(version: ServiceNowVersion): QueryConstants {
    // Check if we already have cached instances
    if (this.instances.has(version)) {
      return this.instances.get(version)!;
    }

    let queries: QueryConstants;

    switch (version) {
      case 'australia':
        queries = {
          QUERY_LIST_PROJECTS: AustraliaQueries.QUERY_LIST_PROJECTS,
          QUERY_GET_PROJECT_DETAILS: AustraliaQueries.QUERY_GET_PROJECT_DETAILS,
          QUERY_LIST_FILTERS: AustraliaQueries.QUERY_LIST_FILTERS,
          QUERY_CREATE_TRANSITION_FILTER: AustraliaQueries.QUERY_CREATE_TRANSITION_FILTER,
          QUERY_CREATE_RULE_BASED_FILTER: AustraliaQueries.QUERY_CREATE_RULE_BASED_FILTER,
          QUERY_CREATE_BREAKDOWN_FILTER: AustraliaQueries.QUERY_CREATE_BREAKDOWN_FILTER,
          QUERY_MINE_PROJECT: AustraliaQueries.QUERY_MINE_PROJECT,
          QUERY_CLUSTER_NODE: AustraliaQueries.QUERY_CLUSTER_NODE,
          QUERY_DELETE_FILTERS: AustraliaQueries.QUERY_DELETE_FILTERS,
          QUERY_GET_FILTER_DETAILS: AustraliaQueries.QUERY_GET_FILTER_DETAILS,
          QUERY_GET_VARIANTS: AustraliaQueries.QUERY_GET_VARIANTS,
          QUERY_GET_BREAKDOWNS: AustraliaQueries.QUERY_GET_BREAKDOWN_VALUES,
          QUERY_CREATE_VARIANT_FILTER: AustraliaQueries.QUERY_CREATE_VARIANT_FILTER,
          QUERY_GET_SCHEDULED_TASKS: AustraliaQueries.QUERY_GET_SCHEDULED_TASKS,
          QUERY_SHOW_RECORDS: AustraliaQueries.QUERY_SHOW_RECORDS,
          QUERY_TRANSITION_WORK_NOTES_ANALYSIS: AustraliaQueries.QUERY_TRANSITION_WORK_NOTES_ANALYSIS,
          QUERY_INTENT_AND_ACTIVITY_ANALYSIS: AustraliaQueries.QUERY_INTENT_AND_ACTIVITY_ANALYSIS,
        };
        break;

      case 'zurich':
        queries = {
          QUERY_LIST_PROJECTS: ZurichQueries.QUERY_LIST_PROJECTS,
          QUERY_GET_PROJECT_DETAILS: ZurichQueries.QUERY_GET_PROJECT_DETAILS,
          QUERY_LIST_FILTERS: ZurichQueries.QUERY_LIST_FILTERS,
          QUERY_CREATE_TRANSITION_FILTER: ZurichQueries.QUERY_CREATE_TRANSITION_FILTER,
          QUERY_CREATE_RULE_BASED_FILTER: ZurichQueries.QUERY_CREATE_RULE_BASED_FILTER,
          QUERY_CREATE_BREAKDOWN_FILTER: ZurichQueries.QUERY_CREATE_BREAKDOWN_FILTER,
          QUERY_MINE_PROJECT: ZurichQueries.QUERY_MINE_PROJECT,
          QUERY_CLUSTER_NODE: ZurichQueries.QUERY_CLUSTER_NODE,
          QUERY_DELETE_FILTERS: ZurichQueries.QUERY_DELETE_FILTERS,
          QUERY_GET_FILTER_DETAILS: ZurichQueries.QUERY_GET_FILTER_DETAILS,
          QUERY_GET_VARIANTS: ZurichQueries.QUERY_GET_VARIANTS,
          QUERY_GET_BREAKDOWNS: ZurichQueries.QUERY_GET_BREAKDOWN_VALUES,
          QUERY_CREATE_VARIANT_FILTER: ZurichQueries.QUERY_CREATE_VARIANT_FILTER,
          QUERY_GET_SCHEDULED_TASKS: ZurichQueries.QUERY_GET_SCHEDULED_TASKS,
          QUERY_SHOW_RECORDS: ZurichQueries.QUERY_SHOW_RECORDS,
          QUERY_TRANSITION_WORK_NOTES_ANALYSIS: ZurichQueries.QUERY_TRANSITION_WORK_NOTES_ANALYSIS,
          QUERY_INTENT_AND_ACTIVITY_ANALYSIS: ZurichQueries.QUERY_INTENT_AND_ACTIVITY_ANALYSIS,
        };
        break;

      case 'brazil':
        queries = {
          QUERY_LIST_PROJECTS: BrazilQueries.QUERY_LIST_PROJECTS,
          QUERY_GET_PROJECT_DETAILS: BrazilQueries.QUERY_GET_PROJECT_DETAILS,
          QUERY_LIST_FILTERS: BrazilQueries.QUERY_LIST_FILTERS,
          QUERY_CREATE_TRANSITION_FILTER: BrazilQueries.QUERY_CREATE_TRANSITION_FILTER,
          QUERY_CREATE_RULE_BASED_FILTER: BrazilQueries.QUERY_CREATE_RULE_BASED_FILTER,
          QUERY_CREATE_BREAKDOWN_FILTER: BrazilQueries.QUERY_CREATE_BREAKDOWN_FILTER,
          QUERY_MINE_PROJECT: BrazilQueries.QUERY_MINE_PROJECT,
          QUERY_CLUSTER_NODE: BrazilQueries.QUERY_CLUSTER_NODE,
          QUERY_DELETE_FILTERS: BrazilQueries.QUERY_DELETE_FILTERS,
          QUERY_GET_FILTER_DETAILS: BrazilQueries.QUERY_GET_FILTER_DETAILS,
          QUERY_GET_VARIANTS: BrazilQueries.QUERY_GET_VARIANTS,
          QUERY_GET_BREAKDOWNS: BrazilQueries.QUERY_GET_BREAKDOWNS,
          QUERY_CREATE_VARIANT_FILTER: BrazilQueries.QUERY_CREATE_VARIANT_FILTER,
          QUERY_GET_SCHEDULED_TASKS: BrazilQueries.QUERY_GET_SCHEDULED_TASKS,
          QUERY_SHOW_RECORDS: BrazilQueries.QUERY_SHOW_RECORDS,
          QUERY_TRANSITION_WORK_NOTES_ANALYSIS: BrazilQueries.QUERY_TRANSITION_WORK_NOTES_ANALYSIS,
          QUERY_INTENT_AND_ACTIVITY_ANALYSIS: BrazilQueries.QUERY_INTENT_AND_ACTIVITY_ANALYSIS,
        };
        break;

      default:
        throw new Error(`Unsupported ServiceNow version: ${version}`);
    }

    // Cache the instance
    this.instances.set(version, queries);
    return queries;
  }

  /**
   * Auto-detect version based on instance URL or environment variables
   * @param instanceUrl - ServiceNow instance URL
   * @param version - Optional explicit version override
   * @returns ServiceNowVersion
   */
  static detectVersion(instanceUrl: string, version?: string): ServiceNowVersion {
    // If version is explicitly provided, validate and use it
    if (version) {
      const validVersions: ServiceNowVersion[] = ['australia', 'zurich', 'brazil'];
      if (validVersions.includes(version as ServiceNowVersion)) {
        return version as ServiceNowVersion;
      }
      // If invalid version provided, fall back to auto-detection
    }

    // Auto-detect based on instance URL patterns
    const url = instanceUrl.toLowerCase();
    
    if (url.includes('australia') || url.includes('aus')) {
      return 'australia';
    } else if (url.includes('zurich') || url.includes('zrh')) {
      return 'zurich';
    } else if (url.includes('brazil') || url.includes('brz')) {
      return 'brazil';
    }

    // Default fallback
    return 'australia';
  }

  /**
   * Get queries with automatic version detection
   * @param instanceUrl - ServiceNow instance URL
   * @param version - Optional explicit version override
   * @returns QueryConstants object
   */
  static getQueriesAuto(instanceUrl: string, version?: string): QueryConstants {
    const detectedVersion = this.detectVersion(instanceUrl, version);
    return this.getQueries(detectedVersion);
  }

  /**
   * Clear cached instances (useful for testing or dynamic reloading)
   */
  static clearCache(): void {
    this.instances.clear();
  }
}
