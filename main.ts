interface Consumer<T> {
  onValueChange(value: T): void;
}

interface Signal<T> {
  (): T;
  isSignal: unknown;
  update(newValue: T): void;
}

const SIGNAL = Symbol("SIGNAL");

function isSignal(potentialSignal: unknown): potentialSignal is Signal<string> {
  return true;
}

let activeConsumer: Consumer<any> | undefined;

function signal<T>(value: T): Signal<T> {
  let internalValue = value;
  const consumers = new Set<Consumer<T>>();

  const notifyConsumers = () => {
    for (const consumer of consumers) {
      consumer.onValueChange(internalValue);
    }
  };

  return Object.assign(
    () => {
      if (activeConsumer) {
        consumers.add(activeConsumer);
      }
      return internalValue;
    },
    {
      isSignal: true,
      update(newValue: T) {
        internalValue = newValue;
        notifyConsumers();
      },
    }
  );
}

const effect = function (effectFn: () => void): void {
  const prevConsumer = activeConsumer;
  activeConsumer = {
    onValueChange(value: any) {
      effectFn();
    },
  };
  effectFn();
  activeConsumer = prevConsumer;
};

class Computed<T> {
  signal: Signal<T>;
  constructor(private computedFn: () => T) {
    const prevConsumer = activeConsumer;
    activeConsumer = this;
    this.signal = signal(this.computedFn());
    activeConsumer = prevConsumer;
  }

  onValueChange(value: any) {
    this.signal.update(this.computedFn());
  }
}

const computed = function <T>(computedFn: () => T): Signal<T> {
  return new Computed(computedFn).signal;
};

abstract class Component {
  static selector = "";

  constructor(public html: string) {}
}

class AppComponent extends Component {
  static selector = "app-root";

  constructor() {
    super(
      `<div>
    <h1>{{title()}}</h1>
    <clock></clock>
  </div>`
    );
  }

  title = signal("Welcome to the Clock App");
}

type BindingMap = Map<keyof Component, { dom: HTMLSpanElement; value: string }>;

type ComponentTree = {
  component: Component;
  bindingMap: BindingMap;
  children: ComponentTree[];
};

class ClockComponent extends Component {
  static selector = "clock";
  constructor() {
    super(
      `<div><p>{{time()}}</p><button (click)="updateTime()">Update</button></div>`
    );
  }

  time = signal(new Date().toLocaleTimeString());

  updateTime() {
    this.time.update(new Date().toLocaleTimeString());
  }
}

let currentBindingId = 1;
let componentTree: ComponentTree | undefined;
const getComponentTree = () => notNullable(() => componentTree);
type ComponentClass = { new (): Component };

const registeredComponents = new Map<string, ComponentClass>(
  [AppComponent, ClockComponent].map((cls) => [cls.selector, cls])
);

function getBindingProperty<Comp extends Component>(
  expression: string,
  component: Comp
): keyof Comp {
  const name = expression.substring(2, expression.length - 4);
  if (!(name in component)) {
    throw new Error(`cannot find ${name} in ${component}`);
  }

  return name as keyof Comp;
}

function notNullable<T>(fn: () => T | undefined): NonNullable<T> {
  const result = fn();
  if (result === undefined || result === null) {
    throw new Error("nullable");
  }
  return result;
}

function setPropertyBindings(component: Component, html: string) {
  const bindingPerId = new Map<
    keyof Component,
    { id: number; value: string }
  >();
  const bindings = html.match(/{{[a-z-]+\(\)}}/g) || [];
  for (const binding of bindings) {
    const name = getBindingProperty(binding, component);
    const signal = component[name];
    if (!isSignal(signal)) {
      throw new Error("only signals");
    }
    const value = signal();
    bindingPerId.set(name, {
      id: currentBindingId,
      value,
    });
    const placeholderTag = `<span id="ng-${currentBindingId}">${value}</span>`;
    html = html.replace(binding, placeholderTag);
    console.log(html);
    currentBindingId++;
  }
  return { bindingPerId, html };
}

function createBindingsMap(
  bindingPerId: Map<keyof Component, { id: number; value: string }>
): BindingMap {
  const bindingMap: BindingMap = new Map<
    keyof Component,
    { dom: HTMLSpanElement; value: string }
  >();
  bindingPerId.forEach(({ id, value }, binding) => {
    bindingMap.set(binding, {
      dom: document.getElementById(`ng-${id}`) as HTMLSpanElement,
      value,
    });
  });
  return bindingMap;
}

function getHandler(event: string, component: Component): keyof Component {
  const handler = notNullable(() => event.match(/"(\w+)\(\)"/))[1];
  return handler as keyof Component;
}

function setEventBindings(component: Component, html: string) {
  const bindingPerId = new Map<number, keyof Component>();
  const events = html.match(/\(click\)="\w+\(\)"/g) || [];
  for (const event of events) {
    currentBindingId++;
    const handler = getHandler(event, component);
    html = html.replace(event, `id="ng-${currentBindingId}"`);
    bindingPerId.set(currentBindingId, handler);
  }

  return { bindingPerId, html };
}

function renderSubComponents(
  component: Component,
  dom: Element
): ComponentTree[] {
  const compontenTrees = [];
  for (const [selector, componentClass] of registeredComponents.entries()) {
    const subComponents = dom.getElementsByTagName(selector);

    if (subComponents.length) {
      const [subComponent] = subComponents;
      compontenTrees.push(renderComponent(subComponent, componentClass));
    }
  }

  return compontenTrees;
}

function applyEventBindings(
  bindingPerId: Map<number, keyof Component>,
  component: Component
) {
  bindingPerId.forEach((handler, id) => {
    const dom = document.getElementById(`ng-${id}`) as Element;
    const handlerFn = component[handler] as unknown as () => void;
    if (typeof handlerFn === "function") {
      dom.addEventListener("click", () => handlerFn.apply(component));
    }
  });
}

function renderComponent(
  parentNode: Element,
  componentClass: ComponentClass
): ComponentTree {
  const component = new componentClass();
  const { bindingPerId: propertyBindingPerId, html: propertyBoundHtml } =
    setPropertyBindings(component, component.html);

  const { bindingPerId: eventBindingPerId, html: finalHtml } = setEventBindings(
    component,
    propertyBoundHtml
  );

  parentNode.innerHTML = finalHtml;
  applyEventBindings(eventBindingPerId, component);
  const bindingMap: BindingMap = createBindingsMap(propertyBindingPerId);

  const componentTree = {
    component,
    bindingMap,
    children: renderSubComponents(component, parentNode),
  };

  for (const [propName, { dom, value }] of componentTree.bindingMap.entries()) {
    const signal = component[propName];
    if (!isSignal(signal)) {
      throw new Error("only signals");
    }
    let firstRun = true;
    effect(() => {
      signal();
      if (firstRun) {
        firstRun = false;
        return;
      }
      detectChanges(componentTree);
    });
  }

  return componentTree;
}

function detectChanges(componentTree: ComponentTree) {
  const { bindingMap, children, component } = componentTree;
  for (const [propName, { dom, value }] of bindingMap.entries()) {
    const signal = component[propName];
    if (!isSignal(signal)) {
      throw new Error("only signals");
    }
    const newValue = signal();

    if (value !== newValue) {
      dom.innerText = newValue;
      bindingMap.set(propName, { dom, value: newValue });
    }
  }
}

function bootstrapApplication() {
  window.addEventListener("load", () => {
    const div = document.createElement("div");
    document.body.appendChild(div);
    componentTree = renderComponent(div, AppComponent);
  });
}

bootstrapApplication();
