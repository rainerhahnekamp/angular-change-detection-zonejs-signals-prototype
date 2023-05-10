abstract class AbstractComponent {
  static selector = "";
  static imports: ComponentClass<AbstractComponent>[] = [];
  constructor(public html: string) {}
}

type ComponentClass<Component extends AbstractComponent> = {
  new (): Component;
  selector: string;
  imports: ComponentClass<AbstractComponent>[];
};

type ComponentTree<Component extends AbstractComponent> = {
  component: Component;
  children: ComponentTree<AbstractComponent>[];
};

function bootstrapApplication<Component extends AbstractComponent>(
  appComponentClass: ComponentClass<Component>
) {
  window.addEventListener("load", () => {
    renderComponent(document.body, appComponentClass);
  });
}

function assertKeyOf<Component extends AbstractComponent>(
  property: string | number | symbol,
  component: Component
): asserts property is keyof Component {
  if (!(property in component)) {
    throw new Error(`${String(property)} is not a property of ${component}`);
  }
}

let currentBindingId = 1;

function setPropertyBindings<Component extends AbstractComponent>(
  component: Component,
  html: string
) {
  const bindingForId = new Map<
    keyof Component,
    { id: number; value: string }
  >();
  for (const [binding, name] of html.matchAll(/{{([a-z-]+)}}/g)) {
    currentBindingId++;
    assertKeyOf(name, component);
    const value = String(component[name]);
    bindingForId.set(name, {
      id: currentBindingId,
      value,
    });
    const placeholderTag = `<span id="ng-${currentBindingId}">${value}</span>`;
    html = html.replace(binding, placeholderTag);
  }
  return { bindingPerId: bindingForId, html };
}

function setEventBindings<Component extends AbstractComponent>(
  component: Component,
  html: string
) {
  const bindingPerId = new Map<number, keyof Component>();
  for (const [binding, name] of html.matchAll(/\(click\)="(\w+)\(\)"/g) || []) {
    currentBindingId++;
    assertKeyOf(name, component);
    html = html.replace(binding, `id="ng-${currentBindingId}"`);
    bindingPerId.set(currentBindingId, name);
  }
  return { bindingPerId, html };
}

function applyEventBindings<Component extends AbstractComponent>(
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

function renderComponent<Component extends AbstractComponent>(
  parentNode: Element,
  componentClass: ComponentClass<Component>
): ComponentTree<AbstractComponent> {
  const component = new componentClass();
  const { bindingPerId: propertyBindingPerId, html: propertyBoundHtml } =
    setPropertyBindings(component, component.html);

  const { bindingPerId: eventBindingPerId, html: finalHtml } = setEventBindings(
    component,
    propertyBoundHtml
  );

  parentNode.innerHTML = finalHtml;
  applyEventBindings(eventBindingPerId, component);

  return {
    component,
    children: renderSubComponents(componentClass, component, parentNode),
  };
}

function renderSubComponents<Component extends AbstractComponent>(
  ParentComponentClass: ComponentClass<Component>,
  component: Component,
  dom: Element
): ComponentTree<AbstractComponent>[] {
  const compontentTrees = [];
  for (const SubComponent of ParentComponentClass.imports) {
    const selector: string = SubComponent.selector;

    const subComponents = dom.getElementsByTagName(selector);

    if (subComponents.length) {
      const [subComponent] = subComponents;
      compontentTrees.push(renderComponent(subComponent, SubComponent));
    }
  }

  return compontentTrees;
}

class ClockComponent extends AbstractComponent {
  static selector = "clock";
  constructor() {
    super(
      `<div><p>{{time}}</p><button (click)="updateTime()">Update</button></div>`
    );
  }

  time = new Date().toLocaleTimeString();

  updateTime() {
    this.time = new Date().toLocaleTimeString();
    console.log(this.time);
  }
}

class AppComponent extends AbstractComponent {
  static imports = [ClockComponent];
  constructor() {
    super(
      `<div>
      <h1>{{title}}</h1>
      <clock></clock>
    </div>`
    );
  }

  title = "Clock App";
}

bootstrapApplication(AppComponent);
