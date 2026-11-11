import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  RETENTION_JOB_NAME as APP_JOB_NAME,
  RETENTION_JOB_PATH as APP_JOB_PATH,
  MIN_RETENTION_TOKEN_LENGTH as APP_MIN_TOKEN_LENGTH,
  RetentionJobBody,
} from "@/lib/privacy/job";
import {
  ALLOWED_KEYS,
  awsArgs,
  awsCommands,
  classifyRetentionSelfCheck,
  dryRunPlan,
  formatCommand,
  functionEnvironment,
  isValidRegion,
  layerArn,
  MIN_RETENTION_TOKEN_LENGTH,
  missingUrlPermissions,
  nextSteps,
  parseEnvFile,
  redact,
  RETENTION_JOB_NAME,
  RETENTION_JOB_PATH,
  retentionCheckCommands,
  retentionDryRunInput,
  retentionScheduleInput,
  retentionScheduleTarget,
  retentionSelfCheckFailure,
  SCHEDULE_NAME,
  scheduleGroupArn,
  schedulerCommands,
  SECRET_KEYS,
  validateDeployEnv,
} from "../../scripts/lib/aws-deploy.mjs";

// Pure parts of `npm run deploy:aws` with fixtures only: no aws CLI, no network, no real secrets.

const TARGET = { profile: "mikusia", region: "eu-central-1" };
const SERVICE_KEY = "eyJhbGciOiJIUzI1NiJ9.fake-service-role-payload.fake-signature";
const ANTHROPIC_KEY = "sk-ant-fake-0123456789abcdef";
const RETENTION_TOKEN = "0123456789abcdef".repeat(4);
const ENV_AWS = `# production (fixture)
SUPABASE_URL=https://abcdefghijklmnop.supabase.co
SUPABASE_SERVICE_ROLE_KEY="${SERVICE_KEY}"
export AI_PROVIDER=anthropic   # Claude
ANTHROPIC_API_KEY='${ANTHROPIC_KEY}'
AI_MODEL=
RETENTION_TOKEN=${RETENTION_TOKEN}
`;
const FILES = { zipPath: "dist-lambda/function.zip", envFile: "/tmp/kolacja-deploy-x/env.json", roleArn: "arn:role" };

function valid(values: Record<string, string>): Record<string, string> {
  const result = validateDeployEnv(values);
  if (!result.ok) throw new Error(result.errors.join(" "));
  return result.variables;
}

function errorsOf(values: Record<string, string>): string[] {
  const result = validateDeployEnv(values);
  return result.ok ? [] : result.errors;
}

describe("parseEnvFile", () => {
  it("reads values with quotes, export, comments and blank lines", () => {
    expect(parseEnvFile(ENV_AWS)).toEqual({
      values: {
        SUPABASE_URL: "https://abcdefghijklmnop.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
        AI_PROVIDER: "anthropic",
        ANTHROPIC_API_KEY: ANTHROPIC_KEY,
        AI_MODEL: "",
        RETENTION_TOKEN,
      },
      errors: [],
    });
  });

  it("reports malformed lines and repeated names with line numbers", () => {
    expect(
      parseEnvFile("SUPABASE_URL=https://a.supabase.co\nnot a line\nSUPABASE_URL=https://b.supabase.co").errors,
    ).toEqual(["Linia 2: oczekiwano NAZWA=wartość.", "Linia 3: SUPABASE_URL występuje drugi raz."]);
  });
});

describe("validateDeployEnv", () => {
  const base = {
    SUPABASE_URL: "https://abcdefghijklmnop.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
    RETENTION_TOKEN,
  };

  it("defaults the AI provider to the mock and drops empty values", () => {
    expect(valid({ ...base, AI_MODEL: "" })).toEqual({ ...base, AI_PROVIDER: "mock" });
  });

  it("accepts anthropic with a key and a model", () => {
    const variables = valid({ ...base, AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: ANTHROPIC_KEY, AI_MODEL: "x" });
    expect(variables).toMatchObject({ AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: ANTHROPIC_KEY, AI_MODEL: "x" });
  });

  it("refuses a local database", () => {
    for (const url of [
      "http://127.0.0.1:54321",
      "http://localhost:54321",
      "https://localhost",
      "http://192.168.1.5:54321",
    ]) {
      expect(errorsOf({ ...base, SUPABASE_URL: url }), url).toEqual([
        "SUPABASE_URL wskazuje lokalną bazę — na AWS potrzebny jest hostowany projekt Supabase.",
      ]);
    }
  });

  it("refuses plain http, a non-URL, missing and unknown names", () => {
    expect(errorsOf({ ...base, SUPABASE_URL: "http://abc.supabase.co" })).toEqual([
      "SUPABASE_URL musi zaczynać się od https://.",
    ]);
    expect(errorsOf({ ...base, SUPABASE_URL: "abc.supabase.co" })).toEqual(["SUPABASE_URL nie jest adresem URL."]);
    expect(errorsOf({ ...base, SUPABASE_SERVICE_ROLE_KEY: "" })).toEqual(["Brak SUPABASE_SERVICE_ROLE_KEY."]);
    expect(errorsOf({ ...base, ANTHROPIC_KEY: "x" })).toEqual([
      `Nieznana zmienna ANTHROPIC_KEY (dozwolone: ${ALLOWED_KEYS.join(", ")}).`,
    ]);
  });

  it("requires a RETENTION_TOKEN of at least 32 base64 / hex characters (the daily clean-up the texts promise)", () => {
    expect(valid(base)).toMatchObject({ RETENTION_TOKEN });
    expect(valid({ ...base, RETENTION_TOKEN: "Ab0+/=_-".repeat(4) })).toMatchObject({
      RETENTION_TOKEN: "Ab0+/=_-".repeat(4),
    });
    // Missing or empty: refused like any required name, with the way to make one.
    const missing =
      "Brak RETENTION_TOKEN (codzienne usuwanie danych gości po terminie) — wygeneruj: openssl rand -hex 32.";
    expect(errorsOf({ SUPABASE_URL: base.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY })).toEqual([missing]);
    expect(errorsOf({ ...base, RETENTION_TOKEN: "" })).toEqual([missing]);
    expect(errorsOf({ SUPABASE_URL: base.SUPABASE_URL })).toEqual(["Brak SUPABASE_SERVICE_ROLE_KEY.", missing]);
    for (const bad of ["x".repeat(31), `${"x".repeat(32)}!`, `${"x".repeat(16)} ${"x".repeat(16)}`]) {
      expect(errorsOf({ ...base, RETENTION_TOKEN: bad }), bad).toEqual([
        "RETENTION_TOKEN: co najmniej 32 znaki (litery, cyfry, + / = _ -) — wygeneruj: openssl rand -hex 32.",
      ]);
    }
    expect(SECRET_KEYS).toContain("RETENTION_TOKEN");
  });

  it("refuses an unknown provider and anthropic without a key", () => {
    expect(errorsOf({ ...base, AI_PROVIDER: "openai" })).toEqual(["AI_PROVIDER musi być jednym z: mock, anthropic."]);
    expect(errorsOf({ ...base, AI_PROVIDER: "anthropic" })).toEqual([
      "AI_PROVIDER=anthropic wymaga ANTHROPIC_API_KEY.",
    ]);
  });
});

describe("functionEnvironment", () => {
  it("is the complete set: Lambda Web Adapter wrapper, port, static readiness path and the app's variables", () => {
    const app = valid(parseEnvFile(ENV_AWS).values);
    expect(functionEnvironment(app)).toEqual({
      AWS_LAMBDA_EXEC_WRAPPER: "/opt/bootstrap",
      PORT: "8080",
      AWS_LWA_READINESS_CHECK_PATH: "/favicon.png",
      AWS_LWA_PASS_THROUGH_PATH: "/api/jobs/retention",
      SUPABASE_URL: "https://abcdefghijklmnop.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
      AI_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: ANTHROPIC_KEY,
      RETENTION_TOKEN,
    });
  });
});

describe("region and layer", () => {
  it("accepts AWS region names only", () => {
    expect(["eu-central-1", "us-east-2", "ap-southeast-1", "us-gov-west-1"].every(isValidRegion)).toBe(true);
    expect([undefined, "", "eu-central", "EU-CENTRAL-1", "eu-central-1 "].some(isValidRegion)).toBe(false);
  });

  it("pins the arm64 Lambda Web Adapter layer in the target region", () => {
    expect(layerArn("eu-central-1")).toBe("arn:aws:lambda:eu-central-1:753240598075:layer:LambdaAdapterLayerArm64:30");
  });
});

describe("awsCommands", () => {
  const commands = awsCommands(TARGET, FILES);
  const flag = (args: string[], name: string) => args[args.indexOf(name) + 1];

  it("always passes the profile and the region explicitly, JSON output and no pager", () => {
    expect(awsArgs(TARGET, ["sts", "get-caller-identity"])).toEqual([
      "sts",
      "get-caller-identity",
      "--profile",
      "mikusia",
      "--region",
      "eu-central-1",
      "--output",
      "json",
      "--no-cli-pager",
    ]);
    for (const args of Object.values(commands)) {
      expect(flag(args, "--profile")).toBe("mikusia");
      expect(flag(args, "--region")).toBe("eu-central-1");
    }
  });

  it("never deletes anything", () => {
    expect(
      Object.values(commands)
        .flat()
        .filter((arg) => /delete|remove/i.test(arg)),
    ).toEqual([]);
  });

  it("creates an arm64 function on nodejs24.x with run.sh, 1024 MB, 30 s, the layer and the env file", () => {
    const args = commands.createFunction;
    expect(args.slice(0, 2)).toEqual(["lambda", "create-function"]);
    expect(flag(args, "--function-name")).toBe("kolacja-podwyzkowa");
    expect(flag(args, "--architectures")).toBe("arm64");
    expect(flag(args, "--runtime")).toBe("nodejs24.x");
    expect(flag(args, "--handler")).toBe("run.sh");
    expect(flag(args, "--memory-size")).toBe("1024");
    expect(flag(args, "--timeout")).toBe("30");
    expect(flag(args, "--layers")).toBe(layerArn("eu-central-1"));
    expect(flag(args, "--role")).toBe("arn:role");
    expect(flag(args, "--zip-file")).toBe("fileb://dist-lambda/function.zip");
    expect(flag(args, "--environment")).toBe("file:///tmp/kolacja-deploy-x/env.json");
  });

  it("updates code and the whole configuration in place", () => {
    expect(commands.updateCode.slice(0, 2)).toEqual(["lambda", "update-function-code"]);
    expect(flag(commands.updateCode, "--zip-file")).toBe("fileb://dist-lambda/function.zip");
    const config = commands.updateConfiguration;
    expect(config.slice(0, 2)).toEqual(["lambda", "update-function-configuration"]);
    for (const name of [
      "--runtime",
      "--handler",
      "--memory-size",
      "--timeout",
      "--layers",
      "--environment",
      "--role",
    ]) {
      expect(flag(config, name), name).toBe(flag(commands.createFunction, name));
    }
  });

  it("opens a public Function URL with both permissions", () => {
    expect(flag(commands.createUrl, "--auth-type")).toBe("NONE");
    expect(commands.addUrlPermission).toEqual(
      expect.arrayContaining(["lambda:InvokeFunctionUrl", "*", "--function-url-auth-type", "NONE"]),
    );
    expect(commands.addInvokePermission).toEqual(
      expect.arrayContaining(["lambda:InvokeFunction", "*", "--invoked-via-function-url"]),
    );
  });

  it("gives the role only the basic execution policy and Lambda as the trusted service", () => {
    expect(flag(commands.attachBasicPolicy, "--policy-arn")).toBe(
      "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
    );
    expect(JSON.parse(flag(commands.createRole, "--assume-role-policy-document"))).toEqual({
      Version: "2012-10-17",
      Statement: [{ Effect: "Allow", Principal: { Service: "lambda.amazonaws.com" }, Action: "sts:AssumeRole" }],
    });
  });

  it("keeps CloudWatch logs for 7 days", () => {
    expect(flag(commands.putRetention, "--retention-in-days")).toBe("7");
    expect(flag(commands.putRetention, "--log-group-name")).toBe("/aws/lambda/kolacja-podwyzkowa");
  });
});

describe("the daily clean-up's schedule", () => {
  const FUNCTION_ARN = "arn:aws:lambda:eu-central-1:123456789012:function:kolacja-podwyzkowa";
  const commands = schedulerCommands(TARGET, {
    account: "123456789012",
    functionArn: FUNCTION_ARN,
    targetFile: "/tmp/kolacja-deploy-x/schedule-target.json",
    checkFile: "/tmp/kolacja-deploy-x/retention-check.json",
    checkOutputFile: "/tmp/kolacja-deploy-x/retention-check-output.json",
  });
  const flag = (args: string[], name: string) => args[args.indexOf(name) + 1];

  it("matches the app: the pass-through path is the route's file, the input is exactly what the route accepts", () => {
    expect(RETENTION_JOB_PATH).toBe(APP_JOB_PATH);
    expect(RETENTION_JOB_NAME).toBe(APP_JOB_NAME);
    expect(MIN_RETENTION_TOKEN_LENGTH).toBe(APP_MIN_TOKEN_LENGTH);
    expect(existsSync(path.join(process.cwd(), "src/pages", `${RETENTION_JOB_PATH}.ts`))).toBe(true);
    expect(RetentionJobBody.parse(JSON.parse(retentionScheduleInput(RETENTION_TOKEN)))).toEqual({
      job: "guest-data-retention",
      token: RETENTION_TOKEN,
    });
  });

  it("gives Scheduler of this account, for the schedule's group in this region, a role that may only invoke this function", () => {
    expect(scheduleGroupArn("eu-central-1", "123456789012")).toBe(
      "arn:aws:scheduler:eu-central-1:123456789012:schedule-group/default",
    );
    // aws:SourceAccount AND aws:SourceArn (confused deputy). Scheduler assumes the role with the schedule GROUP's ARN —
    // AWS: "Do not scope the aws:SourceArn statement to a specific schedule" — so the group the schedule lives in.
    expect(flag(commands.createSchedule, "--group-name")).toBe("default");
    expect(flag(commands.getSchedule, "--group-name")).toBe("default");
    expect(JSON.parse(flag(commands.createSchedulerRole, "--assume-role-policy-document"))).toEqual({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { Service: "scheduler.amazonaws.com" },
          Action: "sts:AssumeRole",
          Condition: {
            StringEquals: {
              "aws:SourceAccount": "123456789012",
              "aws:SourceArn": "arn:aws:scheduler:eu-central-1:123456789012:schedule-group/default",
            },
          },
        },
      ],
    });
    // An existing role (from a deploy before aws:SourceArn) gets exactly the same policy on every deploy.
    expect(commands.updateSchedulerTrust.slice(0, 4)).toEqual([
      "iam",
      "update-assume-role-policy",
      "--role-name",
      "kolacja-podwyzkowa-scheduler",
    ]);
    expect(flag(commands.updateSchedulerTrust, "--policy-document")).toBe(
      flag(commands.createSchedulerRole, "--assume-role-policy-document"),
    );
    expect(JSON.parse(flag(commands.putSchedulerPolicy, "--policy-document"))).toEqual({
      Version: "2012-10-17",
      Statement: [{ Effect: "Allow", Action: "lambda:InvokeFunction", Resource: FUNCTION_ARN }],
    });
    expect(flag(commands.createSchedulerRole, "--role-name")).toBe("kolacja-podwyzkowa-scheduler");
  });

  it("runs daily at a quiet hour in Polish time, exactly on time, and creates or updates with every field", () => {
    const create = commands.createSchedule;
    expect(create.slice(0, 2)).toEqual(["scheduler", "create-schedule"]);
    expect(flag(create, "--name")).toBe(SCHEDULE_NAME);
    expect(SCHEDULE_NAME).toBe("kolacja-podwyzkowa-retention");
    expect(flag(create, "--schedule-expression")).toBe("cron(15 4 * * ? *)");
    expect(flag(create, "--schedule-expression-timezone")).toBe("Europe/Warsaw");
    expect(JSON.parse(flag(create, "--flexible-time-window"))).toEqual({ Mode: "OFF" });
    expect(flag(create, "--state")).toBe("ENABLED");
    expect(flag(create, "--target")).toBe("file:///tmp/kolacja-deploy-x/schedule-target.json");
    expect(commands.updateSchedule.slice(0, 2)).toEqual(["scheduler", "update-schedule"]);
    expect(commands.updateSchedule.slice(2)).toEqual(create.slice(2));
  });

  it("keeps the token off the command line: the target with the input goes through the temp file", () => {
    const target = retentionScheduleTarget({ functionArn: FUNCTION_ARN, roleArn: "arn:role", token: RETENTION_TOKEN });
    expect(target).toEqual({
      Arn: FUNCTION_ARN,
      RoleArn: "arn:role",
      Input: JSON.stringify({ job: "guest-data-retention", token: RETENTION_TOKEN }),
    });
    expect(Object.values(commands).flat().join(" ")).not.toContain(RETENTION_TOKEN);
  });

  it("self-checks with ONE invocation of the function shaped like the schedule's, plus dryRun, through the temp files", () => {
    // The app's route accepts it as a dry run (counts only, nothing deleted).
    expect(RetentionJobBody.parse(JSON.parse(retentionDryRunInput(RETENTION_TOKEN)))).toEqual({
      job: "guest-data-retention",
      token: RETENTION_TOKEN,
      dryRun: true,
    });
    // The schedule's own input stays a real run.
    expect(JSON.parse(retentionScheduleInput(RETENTION_TOKEN))).not.toHaveProperty("dryRun");
    expect(commands.invokeSelfCheck).toEqual([
      "lambda",
      "invoke",
      "--function-name",
      "kolacja-podwyzkowa",
      "--payload",
      "fileb:///tmp/kolacja-deploy-x/retention-check.json",
      "/tmp/kolacja-deploy-x/retention-check-output.json",
      "--profile",
      "mikusia",
      "--region",
      "eu-central-1",
      "--output",
      "json",
      "--no-cli-pager",
    ]);
    // Never the Function URL, never the token.
    expect(commands.invokeSelfCheck.join(" ")).not.toMatch(/lambda-url|https?:/);
    expect(commands.invokeSelfCheck.join(" ")).not.toContain(RETENTION_TOKEN);
  });

  it("always passes the profile and the region, and never deletes anything", () => {
    for (const args of Object.values(commands)) {
      expect(flag(args, "--profile")).toBe("mikusia");
      expect(flag(args, "--region")).toBe("eu-central-1");
    }
    expect(
      Object.values(commands)
        .flat()
        .filter((arg) => /delete|remove/i.test(arg)),
    ).toEqual([]);
  });

  it("checks by hand with the schedule's own input plus dryRun from a private temp directory, never the token itself", () => {
    const lines = retentionCheckCommands(TARGET);
    expect(lines[0]).toBe('d="$(mktemp -d)"');
    expect(lines.join("\n")).toContain(
      'aws scheduler get-schedule --name kolacja-podwyzkowa-retention --group-name default --query Target.Input --output text --profile mikusia --region eu-central-1 > "$d/input.json"',
    );
    expect(lines.join("\n")).toContain(`sed 's/}$/,"dryRun":true}/' "$d/input.json" > "$d/check.json"`);
    expect(lines.join("\n")).toContain(
      'aws lambda invoke --function-name kolacja-podwyzkowa --payload "fileb://$d/check.json"',
    );
    // The sed line turns the schedule's one-line input into exactly the deploy's self-check input.
    const scheduleInput = `${retentionScheduleInput(RETENTION_TOKEN)}\n`;
    expect(scheduleInput.replace(/}$/m, ',"dryRun":true}').trim()).toBe(retentionDryRunInput(RETENTION_TOKEN));
    expect(lines.join("\n")).toContain(
      "aws logs tail /aws/lambda/kolacja-podwyzkowa --since 15m --filter-pattern Retencja",
    );
    expect(lines.join("\n")).not.toMatch(/token/i);
  });
});

describe("missingUrlPermissions", () => {
  const urlStatement = {
    Sid: "FunctionURLAllowPublicAccess",
    Effect: "Allow",
    Principal: "*",
    Action: "lambda:InvokeFunctionUrl",
    Resource: "arn:aws:lambda:eu-central-1:123456789012:function:kolacja-podwyzkowa",
    Condition: { StringEquals: { "lambda:FunctionUrlAuthType": "NONE" } },
  };
  const invokeStatement = {
    Sid: "FunctionURLInvokeAllowPublicAccess",
    Effect: "Allow",
    Principal: "*",
    Action: "lambda:InvokeFunction",
    Resource: "arn:aws:lambda:eu-central-1:123456789012:function:kolacja-podwyzkowa",
    Condition: { Bool: { "lambda:InvokedViaFunctionUrl": "true" } },
  };
  const policy = (...Statement: object[]) => JSON.stringify({ Version: "2012-10-17", Statement });

  it("needs both without a policy and none when the console-style policy is there", () => {
    expect(missingUrlPermissions(null)).toEqual({ url: true, invoke: true });
    expect(missingUrlPermissions(policy(urlStatement, invokeStatement))).toEqual({ url: false, invoke: false });
  });

  it("adds only what is missing, whatever the statement ids", () => {
    expect(missingUrlPermissions(policy({ ...urlStatement, Sid: "other" }))).toEqual({ url: false, invoke: true });
    expect(missingUrlPermissions(policy({ ...invokeStatement, Principal: { AWS: "*" } }))).toEqual({
      url: true,
      invoke: false,
    });
  });

  it("does not count a statement for IAM auth or another principal", () => {
    const iamOnly = { ...urlStatement, Condition: { StringEquals: { "lambda:FunctionUrlAuthType": "AWS_IAM" } } };
    const account = { ...invokeStatement, Principal: { AWS: "arn:aws:iam::444455556666:root" } };
    expect(missingUrlPermissions(policy(iamOnly, account))).toEqual({ url: true, invoke: true });
  });
});

describe("redaction and the dry-run plan", () => {
  it("hides every secret value in printed text", () => {
    expect(redact(`key=${SERVICE_KEY} and ${ANTHROPIC_KEY}!`, [SERVICE_KEY, ANTHROPIC_KEY])).toBe("key=*** and ***!");
    expect(formatCommand(["lambda", "x", "--value", `a ${SERVICE_KEY}`], [SERVICE_KEY])).toBe(
      "aws lambda x --value 'a ***'",
    );
  });

  it("quotes what a shell would expand, so a printed command can be pasted", () => {
    expect(formatCommand(["lambda", "add-permission", "--principal", "*"], [])).toBe(
      "aws lambda add-permission --principal '*'",
    );
  });

  it("lists every step with variable names only, never a value", () => {
    const environment = functionEnvironment(valid(parseEnvFile(ENV_AWS).values));
    const plan = dryRunPlan(TARGET, environment).join("\n");
    expect(plan).not.toContain(SERVICE_KEY);
    expect(plan).not.toContain(ANTHROPIC_KEY);
    expect(plan).not.toContain("abcdefghijklmnop");
    expect(plan).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(plan).toContain("aws lambda create-function --function-name kolacja-podwyzkowa --architectures arm64");
    expect(plan).toContain("aws lambda add-permission");
    expect(plan).toContain("--invoked-via-function-url");
    expect(plan).toContain("Profil mikusia, region eu-central-1.");
    // The token is required, so the clean-up is never skipped.
    expect(plan).not.toContain("POMINIĘTE");
  });

  it("plans the role, the schedule and the self-check, and never shows the token", () => {
    const environment = functionEnvironment(valid(parseEnvFile(ENV_AWS).values));
    expect(environment.RETENTION_TOKEN).toBe(RETENTION_TOKEN);
    const plan = dryRunPlan(TARGET, environment).join("\n");
    expect(plan).not.toContain(RETENTION_TOKEN);
    expect(plan).toContain("RETENTION_TOKEN");
    expect(plan).toContain("AWS_LWA_PASS_THROUGH_PATH=/api/jobs/retention");
    expect(plan).toContain("aws iam create-role --role-name kolacja-podwyzkowa-scheduler");
    expect(plan).toContain("aws iam put-role-policy --role-name kolacja-podwyzkowa-scheduler");
    expect(plan).toContain(
      "aws scheduler create-schedule --name kolacja-podwyzkowa-retention --group-name default --schedule-expression 'cron(15 4 * * ? *)' --schedule-expression-timezone Europe/Warsaw",
    );
    expect(plan).toContain("aws scheduler update-schedule --name kolacja-podwyzkowa-retention");
    expect(plan).toContain("aws iam update-assume-role-policy --role-name kolacja-podwyzkowa-scheduler");
    expect(plan).toContain("aws:SourceArn");
    expect(plan).toContain("8. Samosprawdzenie");
    expect(plan).toContain("aws lambda wait function-updated-v2 --function-name kolacja-podwyzkowa");
    expect(plan).toContain(
      "aws lambda invoke --function-name kolacja-podwyzkowa --payload 'fileb://<plik tymczasowy 0600 z wejściem harmonogramu i dryRun>'",
    );
    expect(redact(`x ${RETENTION_TOKEN} y`, [RETENTION_TOKEN])).toBe("x *** y");
  });
});

describe("the steps printed after a deploy", () => {
  const base = "https://abc123.lambda-url.eu-central-1.on.aws";

  it("start with the first platform administrator on the hosted database, through --remote", () => {
    const text = nextSteps({ base, region: "eu-central-1", aiProvider: "mock" });
    expect(text).toContain(`BASE_URL=${base}`);
    expect(text).toContain("npm run platform:admin -- <twój e-mail> --remote");
    expect(text).toContain(`${base}/logowanie`);
    expect(text).toContain(`${base}/panel/platforma`);
    expect(text).toContain("AWS_REGION=eu-central-1 npm run deploy:aws");
  });

  it("never print SQL for the hosted database, the smoke or the home page's old event creation", () => {
    const sql = /\b(delete|truncate|drop|update)\s+(from\s+)?(table\s+)?public\./i;
    // The guard itself catches the statements the old text printed.
    expect("delete from public.event;").toMatch(sql);
    expect("delete from public.restaurant where id = 1;").toMatch(sql);
    for (const aiProvider of ["mock", "anthropic"]) {
      const text = nextSteps({ base, region: "eu-central-1", aiProvider });
      // The hosted database holds every restaurant of the platform: no statement may touch it.
      expect(text).not.toMatch(sql);
      expect(text).not.toMatch(/SQL Editor/i);
      expect(text).not.toContain("npm run smoke");
      expect(text).not.toContain("Utwórz wydarzenie");
    }
  });

  it("leave out the AI step once the provider is already Anthropic", () => {
    expect(nextSteps({ base, region: "eu-central-1", aiProvider: "anthropic" })).not.toContain("AI_PROVIDER=anthropic");
  });

  it("report the clean-up's self-check: passed (with the next morning's log line), failed (details below) or the manual check", () => {
    const passed = nextSteps({
      base,
      region: "eu-central-1",
      aiProvider: "anthropic",
      selfCheck: { ok: true, events: 3, complete: true },
    });
    expect(passed).toContain("harmonogram kolacja-podwyzkowa-retention (cron(15 4 * * ? *), Europe/Warsaw)");
    expect(passed).toContain("samosprawdzenie przeszło");
    expect(passed).toContain("po terminie 3 wydarzeń, nic nie usunięto");
    expect(passed).toContain(
      "aws logs tail /aws/lambda/kolacja-podwyzkowa --since 24h --filter-pattern Retencja --profile mikusia --region eu-central-1",
    );
    expect(passed).not.toContain("aws lambda invoke");
    expect(
      nextSteps({
        base,
        region: "eu-central-1",
        aiProvider: "anthropic",
        selfCheck: { ok: true, events: 1000, complete: false },
      }),
    ).toContain("po terminie 1000 lub więcej wydarzeń");
    const failed = nextSteps({
      base,
      region: "eu-central-1",
      aiProvider: "mock",
      selfCheck: { ok: false, kind: "not-json", detail: "null" },
    });
    expect(failed).toContain("4. UWAGA: samosprawdzenie codziennego usuwania danych gości NIE przeszło");
    expect(failed).toContain("5. AI:");
    const unchecked = nextSteps({ base, region: "eu-central-1", aiProvider: "anthropic" });
    expect(unchecked).toContain(
      'aws lambda invoke --function-name kolacja-podwyzkowa --payload "fileb://$d/check.json"',
    );
    // RETENTION_TOKEN is required: no step tells how to switch the clean-up on any more.
    for (const text of [passed, failed, unchecked]) {
      expect(text).not.toContain("RETENTION_TOKEN=<wynik");
    }
  });
});

describe("the clean-up's self-check after a deploy", () => {
  const ok = JSON.stringify({ dryRun: true, events: 2, complete: true });

  it("passes only on the app's dryRun counts (the adapter's raw JSON body, or an HTTP-shaped wrapper of it)", () => {
    expect(classifyRetentionSelfCheck({ payload: ok })).toEqual({ ok: true, events: 2, complete: true });
    expect(classifyRetentionSelfCheck({ payload: `${ok}\n`, functionError: null, invokeError: null })).toEqual({
      ok: true,
      events: 2,
      complete: true,
    });
    expect(
      classifyRetentionSelfCheck({ payload: JSON.stringify({ dryRun: true, events: 0, complete: false }) }),
    ).toEqual({ ok: true, events: 0, complete: false });
    expect(classifyRetentionSelfCheck({ payload: JSON.stringify({ statusCode: 200, body: ok }) })).toEqual({
      ok: true,
      events: 2,
      complete: true,
    });
    expect(classifyRetentionSelfCheck({ payload: JSON.stringify({ body: JSON.parse(ok) as unknown }) })).toMatchObject({
      ok: true,
    });
  });

  it("names every other answer", () => {
    const kind = (invocation: Parameters<typeof classifyRetentionSelfCheck>[0]) => {
      const result = classifyRetentionSelfCheck(invocation);
      return result.ok ? "ok" : result.kind;
    };
    // Astro's 403 text (no Content-Type: application/json) or any non-JSON page: the adapter makes it null.
    expect(kind({ payload: "null" })).toBe("not-json");
    expect(kind({ payload: "Cross-site POST form submissions are forbidden" })).toBe("not-json");
    expect(kind({ payload: JSON.stringify("Cross-site POST form submissions are forbidden") })).toBe("not-json");
    expect(
      kind({ payload: JSON.stringify({ statusCode: 403, body: "Cross-site POST form submissions are forbidden" }) }),
    ).toBe("not-json");
    // A wrong token, a body the deployed code does not take: the app's identical 404.
    expect(kind({ payload: '{"error":"Brak dostępu"}' })).toBe("denied");
    expect(kind({ payload: JSON.stringify({ statusCode: 404, body: '{"error":"No access"}' }) })).toBe("denied");
    expect(kind({ payload: JSON.stringify({ statusCode: 500, body: ok }) })).toBe("unexpected");
    // A real run's answer, a broken count, an extra field, an array: not the self-check's answer.
    const realRun = {
      events: 0,
      guests: 0,
      groups: 0,
      snapshots: 0,
      spotlight: 0,
      waiters: 0,
      notes: 0,
      skipped: 0,
      complete: true,
    };
    expect(kind({ payload: JSON.stringify(realRun) })).toBe("unexpected");
    expect(kind({ payload: JSON.stringify({ dryRun: true, events: -1, complete: true }) })).toBe("unexpected");
    expect(kind({ payload: JSON.stringify({ dryRun: true, events: 1.5, complete: true }) })).toBe("unexpected");
    expect(kind({ payload: JSON.stringify({ dryRun: true, events: 1, complete: true, id: 7 }) })).toBe("unexpected");
    expect(kind({ payload: "[]" })).toBe("unexpected");
    // The function failed, the call failed, nothing came back.
    expect(
      kind({ functionError: "Unhandled", payload: '{"errorType":"Runtime.ExitError","errorMessage":"exit"}' }),
    ).toBe("function-error");
    expect(kind({ functionError: "Unhandled", payload: ok })).toBe("function-error");
    expect(kind({ invokeError: "An error occurred (AccessDeniedException)", payload: null })).toBe("invoke-failed");
    expect(kind({ payload: null })).toBe("no-answer");
    expect(kind({ payload: "  " })).toBe("no-answer");
  });

  it("explains a failure loudly: what came back, what it means, what still deletes, how to check again", () => {
    const check = classifyRetentionSelfCheck({ payload: "null" });
    if (check.ok) throw new Error("expected a failure");
    const text = retentionSelfCheckFailure(check, TARGET).join("\n");
    expect(text).toContain("SAMOSPRAWDZENIE CODZIENNEGO USUWANIA DANYCH GOŚCI NIE PRZESZŁO");
    expect(text).toContain("zwróciło: null");
    expect(text).toContain("Cross-site POST form submissions are forbidden");
    expect(text).toContain("Content-Type: application/json");
    expect(text).toContain("otwarcie wydarzenia");
    expect(text).toContain("przeglądanie");
    expect(text).toContain("npm run retention -- --remote");
    expect(text).toContain('aws lambda invoke --function-name kolacja-podwyzkowa --payload "fileb://$d/check.json"');
    expect(text).not.toMatch(/token/i);
    const denied = classifyRetentionSelfCheck({ payload: '{"error":"Brak dostępu"}' });
    if (denied.ok) throw new Error("expected a failure");
    expect(retentionSelfCheckFailure(denied, TARGET).join("\n")).toContain("RETENTION_TOKEN");
    // Every kind has its explanation.
    for (const kind of ["invoke-failed", "function-error", "no-answer", "not-json", "denied", "unexpected"] as const) {
      expect(retentionSelfCheckFailure({ ok: false, kind, detail: "x" }, TARGET).length, kind).toBeGreaterThan(8);
    }
  });
});
