// ServiceNow Brazil Version Query Constants
// This file contains GraphQL query constants specific to ServiceNow Brazil version
export const QUERY_LIST_PROJECTS = `
  query ListProjects {
    projects {
      edges {
        node {
          id
          name
          description
          status
          createdAt
          updatedAt
        }
      }
    }
  }
`;

export const QUERY_GET_PROJECT_DETAILS = `
  query GetProjectDetails($projectId: ID!) {
    project(id: $projectId) {
      id
      name
      description
      status
      createdAt
      updatedAt
      configuration {
        id
        name
        type
      }
    }
  }
`;

export const QUERY_LIST_FILTERS = `
  query ListFilters($projectId: ID!) {
    project(id: $projectId) {
      filters {
        edges {
          node {
            id
            name
            type
            createdAt
            updatedAt
          }
        }
      }
    }
  }
`;

export const QUERY_CREATE_TRANSITION_FILTER = `
  mutation CreateTransitionFilter($projectId: ID!, $name: String!, $configuration: FilterConfigurationInput!) {
    createTransitionFilter(projectId: $projectId, name: $name, configuration: $configuration) {
      id
      name
      type
      createdAt
    }
  }
`;

export const QUERY_CREATE_RULE_BASED_FILTER = `
  mutation CreateRuleBasedFilter($projectId: ID!, $name: String!, $configuration: FilterConfigurationInput!) {
    createRuleBasedFilter(projectId: $projectId, name: $name, configuration: $configuration) {
      id
      name
      type
      createdAt
    }
  }
`;

export const QUERY_CREATE_BREAKDOWN_FILTER = `query snCreateBreakdownFilter($versionId:ID!$filterSets:GlidePromin_FilterInput){GlidePromin_Query{scheduleModel(versionId:$versionId filterSets:$filterSets){__typename ...on GlidePromin_ScheduledTask{...FRAGMENT_SCHEDULED_TASKS}...on GlidePromin_Model{nodes{...FRAGMENT_NODES}edges{...FRAGMENT_EDGES}aggregates{...FRAGMENT_AGGREGATE}breakdowns{...FRAGMENT_BREAKDOWNS}version{id automationDiscoveryReport{id}lastMined filterSets{id name filter{...FRAGMENT_FILTER}caseCount variantCount totalDuration maxDuration minDuration avgDuration medianDuration stdDeviation trimmedAverage}projectDefinition{name projectId paUuid domain source projectEntities{...FRAGMENT_PROJECT_ENTITIES}permissions{canMine canWrite canDelete canShare}}miningStats{totalRecords}versionEntityConfigs{...FRAGMENT_VERSION_ENTITY_CONFIG}}findings{...FRAGMENT_FINDINGS}}}}}fragment FRAGMENT_APPLIED_FILTERS on GlidePromin_AppliedFilters{dataFilter{entityId query}breakdowns{entityId breakdowns{field values}}findingFilter adIntentFilter orderedFilters{type repetitions{...FRAGMENT_REPETITIONS}advancedTransitions{...FRAGMENT_ADVANCED_TRANSITION}variantFilter{entityId variantIds}viewFilter{entityId activities}}}fragment FRAGMENT_REPETITIONS on GlidePromin_Repetitions{minReps maxReps source{entity field value}sink{entity field value}}fragment FRAGMENT_ADVANCED_TRANSITION on GlidePromin_AdvancedTransitionFilter{advancedTransitions{...FRAGMENT_ADVANCED_TRANSITION_INPUT}transitionConstraints{fromIndex toIndex minDuration maxDuration fieldConstraint{type field}}}fragment FRAGMENT_ADVANCED_TRANSITION_INPUT on GlidePromin_AdvancedTransition{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}left{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}left{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}left{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}left{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}left{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}}right{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}}}right{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}left{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}}right{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}}}}right{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}left{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}left{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}}right{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}}}right{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}left{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}}right{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}}}}}right{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}left{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}left{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}left{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}}right{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}}}right{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}left{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}}right{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}}}}right{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}left{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}left{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}}right{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}}}right{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}left{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}}right{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}}}}}}right{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}left{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}left{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}left{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}left{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}}right{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}}}right{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}left{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}}right{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}}}}right{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}left{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}left{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}}right{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}}}right{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}left{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}}right{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}}}}}right{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}left{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}left{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}left{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}}right{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}}}right{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}left{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}}right{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}}}}right{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}left{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}left{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}}right{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}}}right{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}left{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}}right{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}}}}}right{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}left{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}left{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}left{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}}right{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}}}right{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}left{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}}right{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}}}}right{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}left{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}left{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}}right{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}}}right{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}left{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}}right{entityId field predicate occurrence values relation conditionType context{...FRAGMENT_ADVANCED_TRANSITION_CONTEXT}}}}}}}fragment FRAGMENT_ADVANCED_TRANSITION_CONTEXT on GlidePromin_TransitionContext{conditionType entityId field predicate values left{conditionType entityId field predicate values left{conditionType entityId field predicate values left{conditionType entityId field predicate values left{conditionType entityId field predicate values left{conditionType entityId field predicate values}right{conditionType entityId field predicate values}}right{conditionType entityId field predicate values left{conditionType entityId field predicate values}right{conditionType entityId field predicate values}}}right{conditionType entityId field predicate values left{conditionType entityId field predicate values left{conditionType entityId field predicate values}right{conditionType entityId field predicate values}}right{conditionType entityId field predicate values left{conditionType entityId field predicate values}right{conditionType entityId field predicate values}}}}right{conditionType entityId field predicate values left{conditionType entityId field predicate values left{conditionType entityId field predicate values left{conditionType entityId field predicate values}right{conditionType entityId field predicate values}}right{conditionType entityId field predicate values left{conditionType entityId field predicate values}right{conditionType entityId field predicate values}}}right{conditionType entityId field predicate values left{conditionType entityId field predicate values left{conditionType entityId field predicate values}right{conditionType entityId field predicate values}}right{conditionType entityId field predicate values left{conditionType entityId field predicate values}right{conditionType entityId field predicate values}}}}}right{conditionType entityId field predicate values left{conditionType entityId field predicate values left{conditionType entityId field predicate values left{conditionType entityId field predicate values left{conditionType entityId field predicate values}right{conditionType entityId field predicate values}}right{conditionType entityId field predicate values left{conditionType entityId field predicate values}right{conditionType entityId field predicate values}}}right{conditionType entityId field predicate values left{conditionType entityId field predicate values left{conditionType entityId field predicate values}right{conditionType entityId field predicate values}}right{conditionType entityId field predicate values left{conditionType entityId field predicate values}right{conditionType entityId field predicate values}}}}right{conditionType entityId field predicate values left{conditionType entityId field predicate values left{conditionType entityId field predicate values left{conditionType entityId field predicate values}right{conditionType entityId field predicate values}}right{conditionType entityId field predicate values left{conditionType entityId field predicate values}right{conditionType entityId field predicate values}}}right{conditionType entityId field predicate values left{conditionType entityId field predicate values left{conditionType entityId field predicate values}right{conditionType entityId field predicate values}}right{conditionType entityId field predicate values left{conditionType entityId field predicate values}right{conditionType entityId field predicate values}}}}}}fragment FRAGMENT_NODES on GlidePromin_Node{nodeStatsId:id key label activityId entityId isStart isEnd fieldLabel field value absoluteFreq caseFreq maxReps totalTouchPoints avgTouchPoints totalDuration avgDuration totalIdleTime avgIdleTime}fragment FRAGMENT_EDGES on GlidePromin_Edge{id from to absoluteFreq caseFreq maxReps totalDuration maxDuration minDuration avgDuration trimmedAverage stdDeviation medianDuration totalTouchPoints avgTouchPoints}fragment FRAGMENT_AGGREGATE on GlidePromin_Aggregate{entityId model{...FRAGMENT_AGGREGATE_MODEL}node{...FRAGMENT_AGGREGATE_NODE}edge{...FRAGMENT_AGGREGATE_EDGE}variant{...FRAGMENT_AGGREGATE_VARIANT}}fragment FRAGMENT_AGGREGATE_MODEL on GlidePromin_RootAggregate{caseCount variantCount minCaseDuration maxCaseDuration avgCaseDuration trimmedAverage stdDeviation medianDuration uniqueParentRecords totalTouchPoints avgTouchPoints avgIdleTime}fragment FRAGMENT_AGGREGATE_NODE on GlidePromin_NodeAggregate{absoluteFreq{min max}caseFreq{min max}maxReps{min max}}fragment FRAGMENT_AGGREGATE_EDGE on GlidePromin_EdgeAggregate{absoluteFreq{min max}caseFreq{min max}maxReps{min max}minDuration{min max}maxDuration{min max}avgDuration{min max}totalDuration{min max}trimmedAverage{min max}stdDeviation{min max}medianDuration{min max}}fragment FRAGMENT_AGGREGATE_VARIANT on GlidePromin_VariantAggregate{nodeCount{min max}caseFreq{min max}avgDuration{min max}healthScore{min max}trimmedAverage{min max}stdDeviation{min max}medianDuration{min max}}fragment FRAGMENT_BREAKDOWNS on GlidePromin_EntityBreakdownStats{entityId breakdownStats{field label displayName isExcluded excludedLimit line{label value caseCount variantCount avgDuration trimmedAverage stdDeviation medianDuration totalTouchPoints avgTouchPoints totalIdleTime avgIdleTime}}}fragment FRAGMENT_SCHEDULED_TASKS on GlidePromin_ScheduledTask{id label trackerId mlSolutionId progress type typeId versionId createdAt state appliedFilters{...FRAGMENT_APPLIED_FILTERS}}fragment FRAGMENT_PROJECT_ENTITIES on GlidePromin_ProjectEntity{entityId parentId name sourceType{value}table{name label}filter{encodedQuery:value displayValue}activities{id field label displayName isGrouped}activitiesOfInterest{id field label displayName isGrouped}}fragment FRAGMENT_FILTER on GlidePromin_AppliedFilters{dataFilter{entityId query}breakdowns{entityId breakdowns{field values}}findingFilter adIntentFilter orderedFilters{type repetitions{...FRAGMENT_REPETITIONS}advancedTransitions{...FRAGMENT_ADVANCED_TRANSITION}variantFilter{entityId variantIds}viewFilter{entityId activities}}}fragment FRAGMENT_FINDINGS on GlidePromin_Finding{id message shortMessage category categoryLabel field findingSource type totalDuration avgDuration frequency hasCaseIds stdDeviation extraStats{statName statLabel statValue}}fragment FRAGMENT_VERSION_ENTITY_CONFIG on GlidePromin_VersionEntityConfiguration{entityId touchPointEnabled touchPointFields idleTimeEnabled controlFlowField groupField controlFlowValueMapping{category values}}`;

export const QUERY_MINE_PROJECT = `
  query MineProject($projectId: ID!, $configuration: MiningConfigurationInput!) {
    mineProject(projectId: $projectId, configuration: $configuration) {
      id
      status
      startedAt
      completedAt
    }
  }
`;

export const QUERY_CLUSTER_NODE = `
  query ClusterNode($projectId: ID!, $nodeId: ID!, $configuration: ClusteringConfigurationInput!) {
    clusterNode(projectId: $projectId, nodeId: $nodeId, configuration: $configuration) {
      id
      status
      startedAt
      completedAt
    }
  }
`;

export const QUERY_DELETE_FILTERS = `
  mutation DeleteFilters($filterIds: [ID!]!) {
    deleteFilters(filterIds: $filterIds) {
      success
      deletedCount
    }
  }
`;

export const QUERY_GET_FILTER_DETAILS = `
  query GetFilterDetails($filterId: ID!) {
    filter(id: $filterId) {
      id
      name
      type
      configuration
      createdAt
      updatedAt
    }
  }
`;

export const QUERY_GET_VARIANTS = `
  query GetVariants($projectId: ID!, $filterId: ID) {
    project(id: $projectId) {
      variants(filterId: $filterId) {
        edges {
          node {
            id
            name
            caseCount
            frequency
            activities
          }
        }
      }
    }
  }
`;

export const QUERY_GET_BREAKDOWNS = `
  query GetBreakdowns($projectId: ID!, $filterId: ID) {
    project(id: $projectId) {
      breakdowns(filterId: $filterId) {
        edges {
          node {
            id
            name
            type
            values
          }
        }
      }
    }
  }
`;

export const QUERY_CREATE_VARIANT_FILTER = `
  mutation CreateVariantFilter($projectId: ID!, $name: String!, $variantIds: [ID!]!) {
    createVariantFilter(projectId: $projectId, name: $name, variantIds: $variantIds) {
      id
      name
      type
      createdAt
    }
  }
`;

export const QUERY_GET_SCHEDULED_TASKS = `
  query GetScheduledTasks($projectId: ID!) {
    project(id: $projectId) {
      scheduledTasks {
        edges {
          node {
            id
            name
            type
            status
            scheduledAt
            completedAt
          }
        }
      }
    }
  }
`;

export const QUERY_SHOW_RECORDS = `
  query ShowRecords($projectId: ID!, $filterId: ID, $limit: Int, $offset: Int) {
    project(id: $projectId) {
      records(filterId: $filterId, limit: $limit, offset: $offset) {
        edges {
          node {
            id
            caseId
            activities
            timestamps
          }
        }
      }
    }
  }
`;

export const QUERY_TRANSITION_WORK_NOTES_ANALYSIS = `
  query TransitionWorkNotesAnalysis($projectId: ID!, $filterId: ID, $transitionId: ID) {
    project(id: $projectId) {
      transitionWorkNotesAnalysis(filterId: $filterId, transitionId: $transitionId) {
        transitionId
        transitionName
        workNotesCount
        sentimentAnalysis {
          positive
          neutral
          negative
        }
        commonThemes {
          theme
          frequency
        }
      }
    }
  }
`;

export const QUERY_INTENT_AND_ACTIVITY_ANALYSIS = `
  query IntentAndActivityAnalysis($projectId: ID!, $filterId: ID) {
    project(id: $projectId) {
      intentAndActivityAnalysis(filterId: $filterId) {
        intents {
          intent
          frequency
          activities
        }
        activities {
          activity
          frequency
          intents
        }
        correlations {
          intent
          activity
          strength
        }
      }
    }
  }
`;
