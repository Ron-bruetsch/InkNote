using HtmlAgilityPack;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace InkNote.Services;

public class LinkedInProfile
{
    public string? Name { get; set; }
    public string? Headline { get; set; }
    public string? Location { get; set; }
    public string? About { get; set; }
    public string? ProfileImageUrl { get; set; }
    public string? ConnectionCount { get; set; }
    public List<ExperienceEntry> Experience { get; set; } = [];
    public List<EducationEntry> Education { get; set; } = [];
    public List<string> Skills { get; set; } = [];
    public List<string> Certifications { get; set; } = [];
    public List<string> Languages { get; set; } = [];
    public List<string> VolunteerWork { get; set; } = [];
    public List<string> Interests { get; set; } = [];
    public List<string> Groups { get; set; } = [];
    public List<string> Publications { get; set; } = [];
    public string? ContactEmail { get; set; }
    public string? ContactPhone { get; set; }
    public string? ProfileUrl { get; set; }
    public string ParseMode { get; set; } = "unknown";
}

public class ExperienceEntry
{
    public string? Title { get; set; }
    public string? Company { get; set; }
    public string? Duration { get; set; }
    public string? Location { get; set; }
    public string? Description { get; set; }
    public bool IsCurrent { get; set; }
    public int MonthsAgo { get; set; } = 999;
}

public class EducationEntry
{
    public string? School { get; set; }
    public string? Degree { get; set; }
    public string? Field { get; set; }
    public string? Years { get; set; }
}

public class SeVulnerability
{
    public string Category { get; set; } = "";      // spear_phishing | pretexting | vishing | elicitation | physical
    public string Severity { get; set; } = "";      // high | medium | low
    public string Indicator { get; set; } = "";     // what in the profile triggered this
    public string Vector { get; set; } = "";        // attack description
    public List<string> Lures { get; set; } = [];   // concrete example lures/scripts
}

public class LinkedInAnalysisResult
{
    public bool Success { get; set; }
    public string? Error { get; set; }
    public LinkedInProfile? Profile { get; set; }
    public SocialEngReport? SocialEngineering { get; set; }
    public List<EntitySuggestion> Suggestions { get; set; } = [];
}

public class SocialEngReport
{
    public string RiskRating { get; set; } = "low";        // low | medium | high | critical
    public List<string> TechnicalExposure { get; set; } = [];
    public List<string> ContactVectors { get; set; } = [];
    public List<string> RapportTopics { get; set; } = [];
    public List<string> TrustNetworks { get; set; } = [];
    public List<SeVulnerability> Vulnerabilities { get; set; } = [];
    public List<string> RecommendedPretext { get; set; } = [];
    public string Summary { get; set; } = "";
}

public class LinkedInService(IHttpClientFactory httpFactory)
{
    // ── URL fetch (best-effort; parses SEO data LinkedIn exposes publicly) ───

    public async Task<LinkedInAnalysisResult> FetchByUrlAsync(string url)
    {
        try
        {
            using var client = httpFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(12);
            // Use a real browser UA — LinkedIn serves SEO content to browsers
            client.DefaultRequestHeaders.TryAddWithoutValidation("User-Agent",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36");
            client.DefaultRequestHeaders.TryAddWithoutValidation("Accept",
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
            client.DefaultRequestHeaders.TryAddWithoutValidation("Accept-Language", "en-US,en;q=0.9");

            var resp = await client.GetAsync(url);
            var html = await resp.Content.ReadAsStringAsync();

            // 999 = LinkedIn bot block; we still try to parse what we got
            var blocked = (int)resp.StatusCode == 999 || html.Contains("authwall") || html.Contains("login?");

            var profile = ParsePublicHtml(html, url, blocked);

            if (profile.Name == null && blocked)
                return new LinkedInAnalysisResult
                {
                    Success = false,
                    Error = "LinkedIn blocked the request (login wall). Use 'Analyze pasted text' instead — copy the full profile while logged in and paste it here."
                };

            var report = Analyze(profile);
            var suggestions = BuildSuggestions(profile);

            return new LinkedInAnalysisResult { Success = true, Profile = profile, SocialEngineering = report, Suggestions = suggestions };
        }
        catch (Exception ex)
        {
            return new LinkedInAnalysisResult { Success = false, Error = ex.Message };
        }
    }

    private static LinkedInProfile ParsePublicHtml(string html, string url, bool partialOnly)
    {
        var doc = new HtmlDocument();
        doc.LoadHtml(html);
        var profile = new LinkedInProfile { ProfileUrl = url, ParseMode = partialOnly ? "partial_blocked" : "url_full" };

        // JSON-LD (LinkedIn embeds schema.org Person data for SEO)
        foreach (var script in doc.DocumentNode.SelectNodes("//script[@type='application/ld+json']") ?? Enumerable.Empty<HtmlNode>())
        {
            try
            {
                using var jdoc = JsonDocument.Parse(script.InnerText);
                var root = jdoc.RootElement;
                if (!root.TryGetProperty("@type", out var t) || t.GetString() != "Person") continue;

                if (root.TryGetProperty("name", out var name)) profile.Name = name.GetString();
                if (root.TryGetProperty("jobTitle", out var title)) profile.Headline = title.GetString();
                if (root.TryGetProperty("description", out var desc)) profile.About = desc.GetString();
                if (root.TryGetProperty("image", out var img)) profile.ProfileImageUrl = img.GetString();

                if (root.TryGetProperty("address", out var addr) && addr.TryGetProperty("addressLocality", out var loc))
                    profile.Location = loc.GetString();

                if (root.TryGetProperty("worksFor", out var works))
                {
                    var company = works.ValueKind == JsonValueKind.Array
                        ? works[0]
                        : works;
                    if (company.TryGetProperty("name", out var cn))
                        profile.Experience.Add(new ExperienceEntry { Company = cn.GetString(), IsCurrent = true, MonthsAgo = 0 });
                }

                if (root.TryGetProperty("alumniOf", out var alumni))
                {
                    foreach (var a in alumni.EnumerateArray())
                        if (a.TryGetProperty("name", out var aname))
                            profile.Education.Add(new EducationEntry { School = aname.GetString() });
                }

                if (root.TryGetProperty("knowsAbout", out var knows))
                {
                    foreach (var k in knows.EnumerateArray())
                        if (k.ValueKind == JsonValueKind.String)
                            profile.Skills.Add(k.GetString()!);
                }
            }
            catch { }
        }

        // Open Graph fallback
        if (profile.Name == null)
        {
            var ogTitle = doc.DocumentNode.SelectSingleNode("//meta[@property='og:title']")?.GetAttributeValue("content", null);
            if (ogTitle != null)
            {
                // og:title is usually "Name - Title at Company | LinkedIn"
                var parts = ogTitle.Split(" - ", 2);
                profile.Name = parts[0].Trim();
                if (parts.Length > 1) profile.Headline = parts[1].Replace("| LinkedIn", "").Trim();
            }
        }

        if (profile.About == null)
        {
            var ogDesc = doc.DocumentNode.SelectSingleNode("//meta[@property='og:description']")?.GetAttributeValue("content", null)
                      ?? doc.DocumentNode.SelectSingleNode("//meta[@name='description']")?.GetAttributeValue("content", null);
            if (ogDesc != null) profile.About = ogDesc;
        }

        if (profile.ProfileImageUrl == null)
        {
            var ogImg = doc.DocumentNode.SelectSingleNode("//meta[@property='og:image']")?.GetAttributeValue("content", null);
            if (ogImg != null) profile.ProfileImageUrl = ogImg;
        }

        return profile;
    }

    // ── Text analysis (user pastes copied profile text) ──────────────────────

    public LinkedInAnalysisResult AnalyzeText(string text)
    {
        try
        {
            var profile = ParseProfileText(text);
            var report = Analyze(profile);
            var suggestions = BuildSuggestions(profile);
            return new LinkedInAnalysisResult { Success = true, Profile = profile, SocialEngineering = report, Suggestions = suggestions };
        }
        catch (Exception ex)
        {
            return new LinkedInAnalysisResult { Success = false, Error = ex.Message };
        }
    }

    private static LinkedInProfile ParseProfileText(string text)
    {
        var profile = new LinkedInProfile { ParseMode = "pasted_text" };
        var lines = text.Split('\n').Select(l => l.Trim()).Where(l => l.Length > 0).ToList();
        if (lines.Count == 0) return profile;

        // First non-empty line is usually the name
        profile.Name = lines[0];

        // Second line is often the headline
        if (lines.Count > 1 && !IsSectionHeader(lines[1]) && !IsMetaLine(lines[1]))
            profile.Headline = lines[1];

        // Third line: location | connections
        if (lines.Count > 2 && (lines[2].Contains("Area") || lines[2].Contains("·") || lines[2].Contains(",") || Regex.IsMatch(lines[2], @"\d+ connections", RegexOptions.IgnoreCase)))
        {
            var parts = lines[2].Split('·');
            profile.Location = parts[0].Trim();
            var connPart = parts.FirstOrDefault(p => p.Contains("connection", StringComparison.OrdinalIgnoreCase));
            if (connPart != null) profile.ConnectionCount = connPart.Trim();
        }

        // Extract contact info
        profile.ContactEmail = ExtractEmail(text);
        profile.ContactPhone = ExtractPhone(text);

        // Extract URL from text
        var urlMatch = Regex.Match(text, @"linkedin\.com/in/[\w\-]+", RegexOptions.IgnoreCase);
        if (urlMatch.Success) profile.ProfileUrl = "https://www." + urlMatch.Value;

        // Section parsing
        var sections = SplitIntoSections(text);

        if (sections.TryGetValue("about", out var about))
            profile.About = CleanSection(about);

        if (sections.TryGetValue("experience", out var exp))
            profile.Experience = ParseExperience(exp);

        if (sections.TryGetValue("education", out var edu))
            profile.Education = ParseEducation(edu);

        if (sections.TryGetValue("skills", out var skills))
            profile.Skills = ParseList(skills, '·', ',', '\n').Take(40).ToList();

        if (sections.TryGetValue("certifications", out var certs))
            profile.Certifications = ParseCertifications(certs);

        if (sections.TryGetValue("languages", out var langs))
            profile.Languages = ParseLanguages(langs);

        if (sections.TryGetValue("volunteer experience", out var vol))
            profile.VolunteerWork = ParseVolunteer(vol);

        foreach (var key in new[] { "interests", "following", "people also viewed" })
            if (sections.TryGetValue(key, out var interests))
            {
                profile.Interests = ParseList(interests, '·', ',', '\n').Take(30).ToList();
                break;
            }

        if (sections.TryGetValue("groups", out var groups))
            profile.Groups = ParseList(groups, '·', '\n').Take(20).ToList();

        if (sections.TryGetValue("publications", out var pubs))
            profile.Publications = ParseList(pubs, '\n').Take(10).ToList();

        return profile;
    }

    private static Dictionary<string, string> SplitIntoSections(string text)
    {
        var sectionNames = new[] {
            "about", "activity", "experience", "education", "licenses & certifications",
            "certifications", "skills", "languages", "volunteer experience",
            "publications", "patents", "awards", "projects", "interests",
            "following", "groups", "recommendations", "accomplishments",
            "contact info", "people also viewed"
        };

        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var lines = text.Split('\n');
        string? currentSection = null;
        var buffer = new List<string>();

        foreach (var rawLine in lines)
        {
            var line = rawLine.Trim();
            var lower = line.ToLowerInvariant();
            var matched = sectionNames.FirstOrDefault(s => lower == s || lower == s + "s");

            if (matched != null)
            {
                if (currentSection != null && buffer.Count > 0)
                    result[currentSection] = string.Join("\n", buffer);
                currentSection = matched;
                buffer.Clear();
            }
            else if (currentSection != null && !string.IsNullOrEmpty(line))
            {
                buffer.Add(line);
            }
        }

        if (currentSection != null && buffer.Count > 0)
            result[currentSection] = string.Join("\n", buffer);

        return result;
    }

    private static List<ExperienceEntry> ParseExperience(string text)
    {
        var entries = new List<ExperienceEntry>();
        var blocks = Regex.Split(text, @"\n(?=[A-Z][^\n]{5,80}\n)").Where(b => b.Trim().Length > 0);

        foreach (var block in blocks)
        {
            var blines = block.Split('\n').Select(l => l.Trim()).Where(l => l.Length > 0).ToList();
            if (blines.Count < 2) continue;

            var entry = new ExperienceEntry();
            entry.Title = blines[0];

            // "Company · Employment type" or just "Company"
            if (blines.Count > 1) entry.Company = blines[1].Split('·')[0].Trim();

            // Duration line: "Jan 2022 - Present · 2 yrs 3 mos" or "Jan 2022 - Dec 2023"
            var durationLine = blines.FirstOrDefault(l => Regex.IsMatch(l, @"\d{4}"));
            if (durationLine != null)
            {
                entry.Duration = durationLine;
                entry.IsCurrent = durationLine.Contains("Present", StringComparison.OrdinalIgnoreCase);
                if (entry.IsCurrent)
                {
                    var startMatch = Regex.Match(durationLine, @"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})", RegexOptions.IgnoreCase);
                    if (startMatch.Success && int.TryParse(startMatch.Groups[2].Value, out var year))
                    {
                        var month = Array.IndexOf(new[] { "jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec" },
                            startMatch.Groups[1].Value.ToLower()) + 1;
                        var start = new DateTime(year, Math.Max(1, month), 1);
                        entry.MonthsAgo = (int)((DateTime.UtcNow - start).TotalDays / 30.44);
                    }
                }
            }

            // Remaining lines as description
            var descLines = blines.Skip(2).Where(l => l != durationLine && !l.Contains("·")).ToList();
            if (descLines.Count > 0) entry.Description = string.Join(" ", descLines);

            if (entry.Title != null || entry.Company != null)
                entries.Add(entry);
        }

        return entries;
    }

    private static List<EducationEntry> ParseEducation(string text)
    {
        var entries = new List<EducationEntry>();
        var lines = text.Split('\n').Select(l => l.Trim()).Where(l => l.Length > 0).ToList();
        for (int i = 0; i < lines.Count; i++)
        {
            if (lines[i].Length < 4) continue;
            // School name is usually a standalone longer line not containing a comma
            if (Regex.IsMatch(lines[i], @"^\d") || lines[i].Contains("·")) continue;
            var entry = new EducationEntry { School = lines[i] };
            if (i + 1 < lines.Count)
            {
                var nextLine = lines[i + 1];
                var degreeParts = nextLine.Split(',').Select(p => p.Trim()).ToList();
                entry.Degree = degreeParts.FirstOrDefault();
                entry.Field = degreeParts.Count > 1 ? degreeParts[1] : null;
            }
            if (i + 2 < lines.Count && Regex.IsMatch(lines[i + 2], @"\d{4}"))
                entry.Years = lines[i + 2];
            entries.Add(entry);
            i += 2;
        }
        return entries;
    }

    private static List<string> ParseCertifications(string text)
    {
        var certs = new List<string>();
        var lines = text.Split('\n').Select(l => l.Trim()).Where(l => l.Length > 3).ToList();
        for (int i = 0; i < lines.Count; i++)
        {
            // Skip issuer/date lines
            if (Regex.IsMatch(lines[i], @"^(Issued|Expires|Credential)") || Regex.IsMatch(lines[i], @"\d{4}")) continue;
            if (lines[i].Contains("Show credential") || lines[i].Contains("See credential")) continue;
            certs.Add(lines[i]);
        }
        return certs.Distinct().ToList();
    }

    private static List<string> ParseLanguages(string text)
    {
        var langs = new List<string>();
        var lines = text.Split('\n').Select(l => l.Trim()).Where(l => l.Length > 0).ToList();
        for (int i = 0; i < lines.Count; i++)
        {
            if (lines[i].Contains("proficiency", StringComparison.OrdinalIgnoreCase) ||
                lines[i].Contains("Elementary") || lines[i].Contains("Native") ||
                lines[i].Contains("Full") || lines[i].Contains("Limited") ||
                lines[i].Contains("Bilingual")) continue;
            if (lines[i].Length > 2 && lines[i].Length < 50)
                langs.Add(lines[i]);
        }
        return langs.Distinct().ToList();
    }

    private static List<string> ParseVolunteer(string text)
    {
        var entries = new List<string>();
        var lines = text.Split('\n').Select(l => l.Trim()).Where(l => l.Length > 3).ToList();
        for (int i = 0; i < lines.Count; i++)
        {
            if (Regex.IsMatch(lines[i], @"\d{4}") || lines[i].Contains("·")) continue;
            entries.Add(lines[i]);
        }
        return entries.Distinct().ToList();
    }

    private static List<string> ParseList(string text, params char[] separators)
    {
        return text.Split(separators)
            .Select(s => s.Trim())
            .Where(s => s.Length > 1 && s.Length < 80)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static string? ExtractEmail(string text) =>
        Regex.Match(text, @"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}").Value.NullIfEmpty();

    private static string? ExtractPhone(string text) =>
        Regex.Match(text, @"(\+\d[\d\s\-\(\)]{7,18}\d)").Value.NullIfEmpty();

    private static string CleanSection(string text) =>
        string.Join(" ", text.Split('\n').Select(l => l.Trim()).Where(l => l.Length > 0)).Trim();

    private static bool IsSectionHeader(string line)
    {
        var headers = new[] { "About", "Experience", "Education", "Skills", "Certifications",
            "Languages", "Volunteer", "Interests", "Publications", "Awards", "Groups", "Activity" };
        return headers.Any(h => string.Equals(line, h, StringComparison.OrdinalIgnoreCase));
    }

    private static bool IsMetaLine(string line) =>
        line.Contains("connections", StringComparison.OrdinalIgnoreCase) ||
        line.Contains("followers", StringComparison.OrdinalIgnoreCase) ||
        Regex.IsMatch(line, @"^\d+");

    // ── Social engineering analysis ────────────────────────────────────────────

    private static readonly string[] TechKeywords = [
        "AWS", "Azure", "GCP", "Google Cloud", "Office 365", "Microsoft 365", "O365",
        "Salesforce", "SAP", "ServiceNow", "Workday", "Okta", "Active Directory", "LDAP",
        "Kubernetes", "Docker", "Terraform", "Ansible", "Jenkins", "GitHub", "GitLab",
        "Jira", "Confluence", "Slack", "Teams", "Zoom", "SharePoint", "OneDrive",
        "Oracle", "SQL Server", "PostgreSQL", "MySQL", "MongoDB",
        "Python", "Java", "JavaScript", "TypeScript", "C#", ".NET", "Go", "Rust",
        "Cisco", "Palo Alto", "Fortinet", "CrowdStrike", "SentinelOne", "Splunk",
        "VMware", "Hyper-V", "VPN", "Zero Trust", "SIEM", "SOAR"
    ];

    private static readonly string[] HighValueRoles = [
        "ceo", "cto", "ciso", "cfo", "coo", "chief", "president", "vp", "vice president",
        "director", "head of", "managing director", "partner", "principal"
    ];

    private static readonly string[] FinanceRoles = [
        "finance", "accounting", "treasurer", "controller", "payroll", "accounts payable",
        "accounts receivable", "bookkeep", "budget", "audit"
    ];

    private static readonly string[] ItRoles = [
        "sysadmin", "system administrator", "network engineer", "infrastructure",
        "it manager", "it director", "help desk", "support engineer", "devops",
        "platform engineer", "security engineer", "security analyst"
    ];

    private static readonly string[] HrRoles = [
        "human resources", "hr manager", "recruiter", "talent acquisition",
        "people operations", "hr business partner", "onboarding"
    ];

    private static readonly string[] SecurityCerts = [
        "CISSP", "CISM", "CISA", "CEH", "OSCP", "CompTIA Security+",
        "ISO 27001", "PCI DSS", "GDPR", "SOC 2"
    ];

    private static SocialEngReport Analyze(LinkedInProfile profile)
    {
        var report = new SocialEngReport();
        var vulns = new List<SeVulnerability>();
        var allText = BuildSearchableText(profile);

        // ── Technical exposure ────────────────────────────────────────────────
        report.TechnicalExposure = TechKeywords
            .Where(t => allText.Contains(t, StringComparison.OrdinalIgnoreCase))
            .ToList();

        // ── Contact vectors ───────────────────────────────────────────────────
        if (!string.IsNullOrEmpty(profile.ContactEmail))
            report.ContactVectors.Add($"Direct email: {profile.ContactEmail}");
        if (!string.IsNullOrEmpty(profile.ContactPhone))
            report.ContactVectors.Add($"Phone: {profile.ContactPhone}");
        if (!string.IsNullOrEmpty(profile.ProfileUrl))
            report.ContactVectors.Add($"LinkedIn message: {profile.ProfileUrl}");

        // Infer corporate email pattern from name + company
        if (profile.Name != null && profile.Experience.FirstOrDefault(e => e.IsCurrent)?.Company is { } company)
        {
            var nameParts = profile.Name.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
            if (nameParts.Length >= 2)
            {
                var first = nameParts[0].ToLower();
                var last = nameParts[^1].ToLower();
                var domain = InferEmailDomain(company);
                if (domain != null)
                {
                    report.ContactVectors.Add($"Inferred email patterns: {first}.{last}@{domain} or {first[0]}{last}@{domain}");
                }
            }
        }

        // ── Trust networks ────────────────────────────────────────────────────
        foreach (var edu in profile.Education.Where(e => !string.IsNullOrEmpty(e.School)))
            report.TrustNetworks.Add($"{edu.School} alumni network");

        foreach (var vol in profile.VolunteerWork.Take(3))
            report.TrustNetworks.Add(vol);

        foreach (var group in profile.Groups.Take(5))
            report.TrustNetworks.Add(group);

        // ── Rapport topics ────────────────────────────────────────────────────
        report.RapportTopics.AddRange(profile.Interests.Take(8));
        report.RapportTopics.AddRange(profile.VolunteerWork.Take(3));
        if (profile.Languages.Count > 1)
            report.RapportTopics.Add($"Multilingual: {string.Join(", ", profile.Languages)}");

        // ── Vulnerability checks ──────────────────────────────────────────────

        // Recent job change (< 6 months)
        var recentJob = profile.Experience.FirstOrDefault(e => e.IsCurrent && e.MonthsAgo < 6);
        if (recentJob != null)
        {
            vulns.Add(new SeVulnerability
            {
                Category = "pretexting",
                Severity = "high",
                Indicator = $"Started at {recentJob.Company ?? "current employer"} ~{recentJob.MonthsAgo} month(s) ago",
                Vector = "New employees are less familiar with internal processes, security culture, and colleagues — highly receptive to IT/HR impersonation",
                Lures = [
                    $"\"Hi, I'm from the IT onboarding team — we still need to provision your {(report.TechnicalExposure.FirstOrDefault() ?? "system")} access\"",
                    "\"This is HR — we have a deadline today to complete your benefits enrollment\"",
                    "\"Your corporate laptop enrollment token expires tonight, please follow this link\""
                ]
            });
        }

        // Finance role → BEC target
        if (FinanceRoles.Any(r => allText.Contains(r, StringComparison.OrdinalIgnoreCase)))
        {
            vulns.Add(new SeVulnerability
            {
                Category = "spear_phishing",
                Severity = "critical",
                Indicator = "Finance/accounting role — Business Email Compromise target",
                Vector = "Finance roles handle wire transfers, invoices and payment authorisations. CEO or vendor impersonation can result in direct financial loss",
                Lures = [
                    "Spoofed CEO email: \"Urgent — process this wire before close of business, I'm in a meeting\"",
                    "Vendor invoice update: \"Our bank details have changed, please update your records\"",
                    "Payroll diversion: \"Please update my direct deposit details for next cycle\""
                ]
            });
        }

        // IT/sysadmin role
        if (ItRoles.Any(r => allText.Contains(r, StringComparison.OrdinalIgnoreCase)))
        {
            vulns.Add(new SeVulnerability
            {
                Category = "elicitation",
                Severity = "high",
                Indicator = "IT/infrastructure role — high system access",
                Vector = "IT staff often have broad system access and respond to technical requests as part of their job — helpfulness can be exploited",
                Lures = [
                    "Impersonate a vendor: \"I'm from [tech stack vendor] support — we detected unusual activity on your account\"",
                    "Peer impersonation: \"Hey, it's [colleague name from LinkedIn] — can you reset my VPN token? I'm locked out before a client call\"",
                    "Elicitation: open-ended questions about infrastructure during simulated vendor demo"
                ]
            });
        }

        // HR role → onboarding and data access
        if (HrRoles.Any(r => allText.Contains(r, StringComparison.OrdinalIgnoreCase)))
        {
            vulns.Add(new SeVulnerability
            {
                Category = "pretexting",
                Severity = "high",
                Indicator = "HR role — access to personnel data and credential issuance",
                Vector = "HR staff create accounts, handle sensitive employee data and respond to employee requests — impersonating employees or vendors is highly effective",
                Lures = [
                    "New employee pretext: \"I just started this week and haven't received my login yet\"",
                    "Legal impersonation: \"This is legal counsel — we need the employment records for [name] for a compliance audit\"",
                    "Benefits vendor: \"We're updating the benefits portal — can you confirm your HRIS system for the integration?\""
                ]
            });
        }

        // Executive (whaling)
        if (HighValueRoles.Any(r => allText.Contains(r, StringComparison.OrdinalIgnoreCase)))
        {
            vulns.Add(new SeVulnerability
            {
                Category = "spear_phishing",
                Severity = "critical",
                Indicator = "Executive / senior leadership role",
                Vector = "High authority = high-value whaling target and effective impersonation source for BEC attacks targeting subordinates",
                Lures = [
                    "Board / investor impersonation targeting this person",
                    "Their identity impersonated to authorise requests downstream",
                    "M&A / legal document lure sent to this person's known email"
                ]
            });
        }

        // Cloud/SaaS tech exposure → credential phishing
        var cloudTargets = new[] { "AWS", "Azure", "GCP", "Office 365", "Microsoft 365", "Salesforce", "GitHub", "Okta" };
        var exposedCloud = cloudTargets.Where(c => allText.Contains(c, StringComparison.OrdinalIgnoreCase)).ToList();
        if (exposedCloud.Count > 0)
        {
            vulns.Add(new SeVulnerability
            {
                Category = "spear_phishing",
                Severity = "high",
                Indicator = $"Daily use of: {string.Join(", ", exposedCloud)}",
                Vector = "Credential-harvest phishing using realistic platform lures the target uses every day",
                Lures = exposedCloud.Take(3).Select(c => c switch
                {
                    "AWS" => "Fake AWS security alert: 'Unusual sign-in from [location] — verify your identity'",
                    "Azure" or "Microsoft 365" or "Office 365" => "Microsoft account suspension notice with MFA bypass link",
                    "GitHub" => "GitHub security advisory: 'Action required — suspicious OAuth application access'",
                    "Okta" => "Okta push fatigue / MFA bombing + follow-up vishing call",
                    "Salesforce" => "Salesforce password expiry notice with credential harvester",
                    _ => $"Fake {c} alert with credential harvester"
                }).ToList()
            });
        }

        // Security certifications — security-aware but also decision-makers
        var hasSeccert = SecurityCerts.Any(c => allText.Contains(c, StringComparison.OrdinalIgnoreCase));
        if (hasSeccert)
        {
            var certs = SecurityCerts.Where(c => allText.Contains(c, StringComparison.OrdinalIgnoreCase));
            vulns.Add(new SeVulnerability
            {
                Category = "elicitation",
                Severity = "medium",
                Indicator = $"Security certifications: {string.Join(", ", certs)}",
                Vector = "Security-certified professionals are harder to phish directly but valuable elicitation targets — they know processes, vendors and controls intimately",
                Lures = [
                    "Peer researcher outreach: 'I read your conference talk — could I ask you a few questions for our security assessment?'",
                    "Vendor evaluation pretext: 'We're comparing security vendors and would value your expert opinion'",
                    "Professional flattery leading to inadvertent disclosure of security architecture"
                ]
            });
        }

        // Volunteer work → cause-based pretexting
        if (profile.VolunteerWork.Count > 0)
        {
            vulns.Add(new SeVulnerability
            {
                Category = "pretexting",
                Severity = "low",
                Indicator = $"Volunteer work: {string.Join(", ", profile.VolunteerWork.Take(3))}",
                Vector = "Shared values and causes create immediate trust and rapport — charity/cause impersonation bypasses initial suspicion",
                Lures = [
                    $"'{profile.VolunteerWork[0]}' fundraiser outreach referencing their contribution",
                    "Charity sponsorship request from impersonated peer organisation",
                    "Cause-aligned conference invitation with malicious registration link"
                ]
            });
        }

        // Non-English languages → native language phishing
        var nonEnglish = profile.Languages.Where(l => !l.Contains("English", StringComparison.OrdinalIgnoreCase)).ToList();
        if (nonEnglish.Count > 0)
        {
            vulns.Add(new SeVulnerability
            {
                Category = "spear_phishing",
                Severity = "medium",
                Indicator = $"Native/professional proficiency in: {string.Join(", ", nonEnglish)}",
                Vector = "Phishing in the target's native language is significantly more convincing and bypasses English-language security training",
                Lures = nonEnglish.Take(2).Select(l => $"Localised credential phishing in {l}").ToList()
            });
        }

        // Alumni networks → social proof pretexting
        var schools = profile.Education.Select(e => e.School).Where(s => !string.IsNullOrEmpty(s)).ToList();
        if (schools.Count > 0)
        {
            vulns.Add(new SeVulnerability
            {
                Category = "pretexting",
                Severity = "low",
                Indicator = $"Education: {string.Join(", ", schools)}",
                Vector = "Shared alma mater creates immediate trust — 'fellow alumni' openers have high response rates",
                Lures = schools.Take(2).Select(s => $"'Hi, I'm a fellow {s} alum — I saw your profile and wanted to connect'").ToList()
            });
        }

        // Publications / expertise → flattery elicitation
        if (profile.Publications.Count > 0 || allText.Contains("speaker", StringComparison.OrdinalIgnoreCase) || allText.Contains("thought leader", StringComparison.OrdinalIgnoreCase))
        {
            vulns.Add(new SeVulnerability
            {
                Category = "elicitation",
                Severity = "medium",
                Indicator = "Public expert / published author / conference speaker",
                Vector = "Public experts respond positively to being asked for their opinion — elicitation disguised as research interviews is highly effective",
                Lures = [
                    "Fake journalist / researcher requesting expert commentary",
                    "Podcast / webinar invitation leading to probing technical questions",
                    "'I read your article on [topic] and had a follow-up question about your environment'"
                ]
            });
        }

        // Pretexts for recommended approaches
        report.RecommendedPretext = BuildPretext(profile, report);

        // Risk rating
        report.Vulnerabilities = vulns;
        var critCount  = vulns.Count(v => v.Severity == "critical");
        var highCount  = vulns.Count(v => v.Severity == "high");
        report.RiskRating = critCount >= 1 ? "critical" : highCount >= 2 ? "high" : highCount >= 1 ? "medium" : "low";

        // Summary
        report.Summary = BuildSummary(profile, report);

        return report;
    }

    private static List<string> BuildPretext(LinkedInProfile profile, SocialEngReport report)
    {
        var list = new List<string>();
        var currentCompany = profile.Experience.FirstOrDefault(e => e.IsCurrent)?.Company;

        if (currentCompany != null)
            list.Add($"Vendor/partner impersonation targeting {currentCompany}");

        if (report.TrustNetworks.Count > 0)
            list.Add($"Peer from {report.TrustNetworks[0]} (mutual trust network)");

        if (report.TechnicalExposure.Count > 0)
            list.Add($"{report.TechnicalExposure[0]} support / security team impersonation");

        if (profile.Education.Count > 0)
            list.Add($"Fellow {profile.Education[0].School} alumnus reaching out");

        return list;
    }

    private static string BuildSummary(LinkedInProfile profile, SocialEngReport report)
    {
        var parts = new List<string>();

        if (profile.Name != null) parts.Add($"{profile.Name}");
        if (profile.Headline != null) parts.Add(profile.Headline);

        parts.Add($"Risk rating: {report.RiskRating.ToUpper()}");
        parts.Add($"{report.Vulnerabilities.Count} attack vector(s) identified");

        if (report.TechnicalExposure.Count > 0)
            parts.Add($"Technical exposure: {string.Join(", ", report.TechnicalExposure.Take(5))}");

        if (report.ContactVectors.Count > 0)
            parts.Add($"Contact: {report.ContactVectors[0]}");

        return string.Join(" · ", parts);
    }

    private static string BuildSearchableText(LinkedInProfile p)
    {
        var parts = new List<string?> { p.Name, p.Headline, p.About, p.Location };
        parts.AddRange(p.Skills);
        parts.AddRange(p.Certifications);
        parts.AddRange(p.Interests);
        parts.AddRange(p.VolunteerWork);
        parts.AddRange(p.Experience.Select(e => $"{e.Title} {e.Company} {e.Description}"));
        return string.Join(" ", parts.Where(s => s != null));
    }

    private static List<EntitySuggestion> BuildSuggestions(LinkedInProfile profile)
    {
        var suggestions = new List<EntitySuggestion>();

        foreach (var exp in profile.Experience.Where(e => !string.IsNullOrEmpty(e.Company)).DistinctBy(e => e.Company))
            suggestions.Add(new EntitySuggestion
            {
                Type = "org",
                Label = exp.Company!,
                RelationLabel = exp.IsCurrent ? "works at" : "worked at"
            });

        foreach (var edu in profile.Education.Where(e => !string.IsNullOrEmpty(e.School)).DistinctBy(e => e.School))
            suggestions.Add(new EntitySuggestion { Type = "org", Label = edu.School!, RelationLabel = "studied at" });

        if (!string.IsNullOrEmpty(profile.ContactEmail))
            suggestions.Add(new EntitySuggestion { Type = "email", Label = profile.ContactEmail, RelationLabel = "email" });

        if (!string.IsNullOrEmpty(profile.ContactPhone))
            suggestions.Add(new EntitySuggestion { Type = "phone", Label = profile.ContactPhone, RelationLabel = "phone" });

        return suggestions;
    }

    private static string? InferEmailDomain(string company)
    {
        var clean = Regex.Replace(company.ToLower(), @"[^a-z0-9]", "").Trim();
        return clean.Length > 2 ? $"{clean}.com" : null;
    }
}

internal static class StringExtensions
{
    public static string? NullIfEmpty(this string s) => string.IsNullOrWhiteSpace(s) ? null : s;
}
