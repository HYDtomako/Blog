/** Locale UI chrome for Refined-X (not brand/content identity). */

export type UiCopy = {
	nav: {
		writing: string;
		notes: string;
		projects: string;
		about: string;
		primaryAria: string;
		mobileAria: string;
		openMenuAria: string;
		homeAria: (brand: string) => string;
	};
	language: {
		switchTitle: string;
		switchAria: (label: string) => string;
	};
	ask: {
		placeholder: string;
		overlayPlaceholder: string;
		pagePlaceholder: string;
		button: string;
		pageTitle: string;
		pageLede: string;
		openAria: string;
		openTitle: string;
		closeAria: string;
		overlayHeading: string;
		privacyNote: string;
		privacyNoteEphemeral: string;
		/** Shown instead of the privacy note when the build has no remote Ask endpoint. */
		staticNote: string;
		relatedPublic: string;
		readyStatus: string;
		dataSource: string;
	};
	mcp: {
		guideTitle: string;
		guideLede: string;
		guideFollowup: (unsupported: string) => string;
		agentPrompt: (url: string) => string;
		agentPromptMissing: string;
		openAria: string;
		openTitle: string;
		copyButton: string;
		copied: string;
		copyFailed: string;
		resourcesLabel: string;
		llmsBlurb: string;
		openapiBlurb: string;
		healthLabel: string;
		healthBlurb: string;
		closeAria: string;
	};
	home: {
		sectionAria: string;
		aboutHeading: string;
		aboutLink: string;
		latestHeading: string;
		blogLink: string;
		notesHeading: string;
		notesLink: string;
		ossHeading: string;
		ossLink: string;
	};
	notes: {
		label: string;
		homeCrumb: string;
		indexDescription: string;
		indexLede: string;
		articleCountSuffix: (n: number) => string;
	};
	writing: {
		label: string;
		seriesHeading: string;
		archiveHeading: string;
		featuredHeading: string;
		faqHeading: string;
		homeCrumb: string;
		browseByTopic: string;
		pageCrumb: (n: number) => string;
		seriesEyebrow: (no: string) => string;
		seriesLabel: string;
		enterSeries: string;
		articlesCount: (n: number) => string;
		curatedQa: string;
		expandAll: (n: number) => string;
		collapseAll: string;
		backToSeries: string;
		relatedMeta: string;
		summaryTitle: string;
		articleCountSuffix: (n: number) => string;
		pageProgress: (page: number, total: number) => string;
	};
	comments: {
		heading: string;
		meta: string;
		note: string;
		loading: string;
		unavailable: string;
		noScript: string;
		openDiscussions: string;
	};
	projects: {
		ossHeading: string;
		featuredHeading: string;
		coursesHeading: string;
		coursesAria: string;
		courseEmptyAria: string;
		courseCoverAlt: string;
		courseAuthorFallback: string;
		moreHeading: string;
		snippetsHeading: string;
		viewProject: string;
		highlightsAria: string;
		proofAria: (title: string) => string;
		nextCourse: string;
		notYetPublic: string;
		slot: (n: number) => string;
		maintaining: string;
		starsAria: (n: number) => string;
		activityHeading: string;
		activityTotal: (n: number) => string;
		activitySynced: (date: string) => string;
		activityAria: string;
		projectShotAlt: (title: string) => string;
		courseCoverAltTitle: (title: string) => string;
	};
	topics: {
		label: string;
		allHeading: string;
		directory: string;
		homeCrumb: string;
		indexDescription: string;
		indexLede: string;
		topicTitle: (name: string) => string;
		topicDescription: (name: string) => string;
		articlesCollected: (n: number) => string;
	};
	answers: {
		label: string;
		homeCrumb: string;
		askCta: string;
		indexLede: string;
		answerCrumb: string;
		askAgain: string;
		aboutPerson: (name: string) => string;
	};
	about: {
		profileAria: string;
		linksAria: string;
		cooperationFallback: string;
		allProjects: string;
		askCollaborate: (persona: string) => string;
		askCollaborateButton: string;
		qq: (id: string) => string;
		sendEmail: string;
	};
	common: {
		home: string;
		close: string;
		relatedReading: string;
		breadcrumbAria: string;
		articleTocAria: string;
		paginationAria: string;
		notFoundDescription: string;
		notFoundTitle: string;
		notFoundLede: string;
		backHome: string;
		browseWriting: string;
		prevPage: string;
		nextPage: string;
		toc: string;
		tocSections: (n: number) => string;
		read: string;
		published: string;
		updated: string;
		readingMinutes: (n: number) => string;
	};
	intro: {
		/** Escape hatch on the home page's deep-sea instrument intro. */
		skip: string;
	};
	stats: {
		heading: string;
		articles: string;
		notes: string;
		totalViews: string;
		viewsLabel: string;
		likeAction: string;
		unlikeAction: string;
		failed: string;
	};
	footer: {
		content: string;
		site: string;
		agentFriendly: string;
		topics: string;
		answers: string;
		/** Series links carry a prefix so they cannot read as a duplicate of the collection above them. */
		seriesLink: (title: string) => string;
		badge: string;
	};
	theme: {
		light: string;
		dark: string;
		toggleAria: (next: string) => string;
	};
	askRuntime: {
		thinkingMessages: readonly string[];
		verifyingLive: string;
		curatedSource: string;
		liveSource: string;
		curatedFootPrimary: string;
		liveFootPrimary: string;
		liveFootPrimaryEphemeral: string;
		curatedFootSecondary: string;
		liveFootSecondary: string;
		rateLimited: string;
		timeout: string;
		unavailable: string;
		stop: string;
		ask: string;
		showingCurated: string;
		curatedDone: string;
		findingContent: string;
		challengeUnavailable: string;
		challengeScriptFailed: string;
		organizingAnswer: string;
		emptyAnswer: string;
		answerDone: string;
		stoppedText: string;
		stoppedStatus: string;
		temporarilyUnavailable: string;
		loadingVerify: string;
		processingAsk: string;
		turnstileAria: string;
		invalidStream: string;
		invalidStreamEmpty: string;
		incompleteStream: string;
		serviceUnavailable: string;
	};
	askSearch: {
		retry: string;
		answersGroup: string;
		articlesGroup: string;
		aiFallback: string;
		/** Fallback link copy when the build has no live Ask endpoint. */
		aiFallbackSearch: string;
		loadingIndex: string;
		indexFailed: string;
		noResults: string;
	};
};
